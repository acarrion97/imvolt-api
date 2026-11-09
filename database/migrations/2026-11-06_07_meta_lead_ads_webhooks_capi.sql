alter table public.campanias_publicitarias
  add column if not exists meta_pixel_id text;

create table if not exists public.meta_capi_events (
  meta_capi_event_id bigserial primary key,
  empresa_id bigint not null references public.empresas (empresa_id) on delete cascade,
  contacto_id bigint not null references public.contactos (contacto_id) on delete cascade,
  event_id text not null unique,
  event_name text not null check (event_name in ('Schedule', 'Purchase')),
  estado text not null default 'pending' check (estado in ('pending', 'sent', 'failed')),
  error_code text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);

create index if not exists idx_meta_capi_events_empresa
  on public.meta_capi_events (empresa_id, creado_en desc);

alter table public.meta_capi_events enable row level security;
revoke all on public.meta_capi_events from anon, authenticated;

create or replace function public.ingest_meta_lead(
  p_empresa_id bigint,
  p_campania_id bigint,
  p_provider_lead_id text,
  p_nombres text,
  p_apellidos text,
  p_correo text,
  p_telefono text
) returns table(contacto_id bigint, was_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id bigint;
  matched_count integer;
  normalized_email text := nullif(lower(trim(p_correo)), '');
  normalized_phone text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
begin
  if p_empresa_id is null or p_provider_lead_id is null or length(p_provider_lead_id) > 100 then
    raise exception 'invalid_lead_identity';
  end if;
  if normalized_email is null and normalized_phone is null then
    raise exception 'lead_requires_email_or_phone';
  end if;

  perform pg_advisory_xact_lock(p_empresa_id);

  select c.contacto_id into existing_id
  from public.contactos c
  where c.empresa_id = p_empresa_id
    and c.referencia_externa = p_provider_lead_id
  limit 1;
  if existing_id is not null then
    return query select existing_id, true;
    return;
  end if;

  select count(distinct c.contacto_id), min(c.contacto_id)
    into matched_count, existing_id
  from public.contactos c
  where c.empresa_id = p_empresa_id
    and (
      (normalized_email is not null and lower(trim(coalesce(c.correo, ''))) = normalized_email)
      or (
        normalized_phone is not null
        and nullif(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), '') = normalized_phone
      )
    );

  if matched_count > 1 then
    raise exception 'lead_identity_conflict';
  end if;
  if existing_id is not null then
    update public.contactos c set
      nombres = coalesce(nullif(trim(p_nombres), ''), c.nombres),
      apellidos = coalesce(nullif(trim(p_apellidos), ''), c.apellidos),
      correo = coalesce(normalized_email, c.correo),
      telefono = coalesce(nullif(trim(p_telefono), ''), c.telefono),
      referencia_externa = p_provider_lead_id,
      actualizado_en = now()
    where c.contacto_id = existing_id;
    return query select existing_id, true;
    return;
  end if;

  insert into public.contactos (
    empresa_id, campania_id, nombres, apellidos, correo, telefono,
    origen, referencia_externa, etapa
  ) values (
    p_empresa_id, p_campania_id,
    coalesce(nullif(trim(p_nombres), ''), 'Lead'),
    coalesce(trim(p_apellidos), ''),
    normalized_email,
    nullif(trim(p_telefono), ''),
    'meta_formulario',
    p_provider_lead_id,
    'nuevo'
  ) returning public.contactos.contacto_id into existing_id;

  return query select existing_id, false;
end;
$$;

revoke all on function public.ingest_meta_lead(bigint, bigint, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.ingest_meta_lead(bigint, bigint, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
