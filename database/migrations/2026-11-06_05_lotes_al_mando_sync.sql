alter table public.propiedades
    add column if not exists proyecto_id bigint;

do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute source_column
          on source_column.attrelid = c.conrelid
         and source_column.attnum = c.conkey[1]
        join pg_attribute target_column
          on target_column.attrelid = c.confrelid
         and target_column.attnum = c.confkey[1]
        where c.contype = 'f'
          and array_length(c.conkey, 1) = 1
          and array_length(c.confkey, 1) = 1
          and c.conrelid = 'public.propiedades'::regclass
          and c.confrelid = 'public.proyectos'::regclass
          and source_column.attname = 'proyecto_id'
          and target_column.attname = 'proyecto_id'
    ) then
        alter table public.propiedades
            add constraint propiedades_proyecto_id_fkey
            foreign key (proyecto_id)
            references public.proyectos (proyecto_id)
            on delete set null;
    end if;
end;
$$;

create table if not exists public.lotes_al_mando_mappings (
    mapping_id           bigserial primary key,
    empresa_id           bigint not null references public.empresas (empresa_id) on delete cascade,
    recurso_externo      varchar(30) not null check (recurso_externo in ('proyecto', 'lote')),
    id_externo           varchar(100) not null,
    proyecto_id          bigint references public.proyectos (proyecto_id) on delete cascade,
    propiedad_id         bigint references public.propiedades (propiedad_id) on delete cascade,
    sincronizado_en      timestamptz not null default now(),
    unique (empresa_id, recurso_externo, id_externo),
    check (
      (recurso_externo = 'proyecto' and proyecto_id is not null and propiedad_id is null)
      or (recurso_externo = 'lote' and propiedad_id is not null and proyecto_id is null)
    )
);

create index if not exists idx_lam_mappings_empresa
    on public.lotes_al_mando_mappings (empresa_id, recurso_externo);

alter table public.lotes_al_mando_mappings enable row level security;
revoke all on public.lotes_al_mando_mappings from anon, authenticated;

create or replace function public.sync_lotes_al_mando_project(
    p_empresa_id bigint,
    p_id_externo text,
    p_nombre text,
    p_total_lotes integer
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_proyecto_id bigint;
begin
    if p_empresa_id is null or p_empresa_id <= 0
       or nullif(trim(p_id_externo), '') is null
       or nullif(trim(p_nombre), '') is null then
        raise exception 'INVALID_LOTES_AL_MANDO_PROJECT';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('imvolt:lam:' || p_empresa_id::text, 0));

    select proyecto_id
      into v_proyecto_id
      from public.lotes_al_mando_mappings
     where empresa_id = p_empresa_id
       and recurso_externo = 'proyecto'
       and id_externo = p_id_externo;

    if v_proyecto_id is null then
        insert into public.proyectos (nombre, tipo, total_lotes, empresa_id)
        values (left(trim(p_nombre), 120), 'lotizacion', nullif(p_total_lotes, 0), p_empresa_id)
        returning proyecto_id into v_proyecto_id;
    else
        update public.proyectos
           set nombre = left(trim(p_nombre), 120),
               total_lotes = nullif(p_total_lotes, 0),
               actualizado_en = now()
         where proyecto_id = v_proyecto_id
           and empresa_id = p_empresa_id;

        if not found then
            delete from public.lotes_al_mando_mappings
             where empresa_id = p_empresa_id
               and recurso_externo = 'proyecto'
               and id_externo = p_id_externo;
            insert into public.proyectos (nombre, tipo, total_lotes, empresa_id)
            values (left(trim(p_nombre), 120), 'lotizacion', nullif(p_total_lotes, 0), p_empresa_id)
            returning proyecto_id into v_proyecto_id;
        end if;
    end if;

    insert into public.lotes_al_mando_mappings
        (empresa_id, recurso_externo, id_externo, proyecto_id, propiedad_id, sincronizado_en)
    values
        (p_empresa_id, 'proyecto', p_id_externo, v_proyecto_id, null, now())
    on conflict (empresa_id, recurso_externo, id_externo)
    do update set proyecto_id = excluded.proyecto_id,
                  propiedad_id = null,
                  sincronizado_en = now();

    return v_proyecto_id;
end;
$$;

create or replace function public.sync_lotes_al_mando_lot(
    p_empresa_id bigint,
    p_id_proyecto_externo text,
    p_id_lote_externo text,
    p_nombre text,
    p_ubicacion text,
    p_precio numeric,
    p_disponibilidad text,
    p_descripcion text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_proyecto_id bigint;
    v_propiedad_id bigint;
    v_tipo_propiedad_id bigint;
begin
    if p_empresa_id is null or p_empresa_id <= 0
       or nullif(trim(p_id_proyecto_externo), '') is null
       or nullif(trim(p_id_lote_externo), '') is null
       or nullif(trim(p_nombre), '') is null
       or p_precio is null or p_precio <= 0 then
        raise exception 'INVALID_LOTES_AL_MANDO_LOT';
    end if;
    if p_disponibilidad not in ('disponible', 'reservada', 'vendida', 'no_disponible') then
        raise exception 'INVALID_LOTES_AL_MANDO_AVAILABILITY';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('imvolt:lam:' || p_empresa_id::text, 0));

    select proyecto_id
      into v_proyecto_id
      from public.lotes_al_mando_mappings
     where empresa_id = p_empresa_id
       and recurso_externo = 'proyecto'
       and id_externo = p_id_proyecto_externo;
    if v_proyecto_id is null then
        raise exception 'LOTE_PROJECT_MAPPING_NOT_FOUND';
    end if;

    select tipo_propiedad_id
      into v_tipo_propiedad_id
      from public.tipos_propiedades
     where lower(nombre) = 'lote'
       and estado = 'activo'
     order by tipo_propiedad_id
     limit 1;
    if v_tipo_propiedad_id is null then
        insert into public.tipos_propiedades (nombre, estado)
        values ('Lote', 'activo')
        returning tipo_propiedad_id into v_tipo_propiedad_id;
    end if;

    select propiedad_id
      into v_propiedad_id
      from public.lotes_al_mando_mappings
     where empresa_id = p_empresa_id
       and recurso_externo = 'lote'
       and id_externo = p_id_lote_externo;

    if v_propiedad_id is null then
        insert into public.propiedades (
            nombre, ubicacion, precio, disponibilidad, descripcion,
            empresa_id, tipo_propiedad_id, proyecto_id, medios_autorizados
        )
        values (
            left(trim(p_nombre), 50), left(coalesce(nullif(trim(p_ubicacion), ''), 'Ubicación no especificada'), 500),
            p_precio, p_disponibilidad, left(coalesce(p_descripcion, ''), 2000),
            p_empresa_id, v_tipo_propiedad_id, v_proyecto_id, '{}'
        )
        returning propiedad_id into v_propiedad_id;
    else
        update public.propiedades
           set nombre = left(trim(p_nombre), 50),
               ubicacion = left(coalesce(nullif(trim(p_ubicacion), ''), 'Ubicación no especificada'), 500),
               precio = p_precio,
               disponibilidad = p_disponibilidad,
               descripcion = left(coalesce(p_descripcion, ''), 2000),
               tipo_propiedad_id = v_tipo_propiedad_id,
               proyecto_id = v_proyecto_id,
               estado = 'activo',
               actualizado_en = now()
         where propiedad_id = v_propiedad_id
           and empresa_id = p_empresa_id;

        if not found then
            delete from public.lotes_al_mando_mappings
             where empresa_id = p_empresa_id
               and recurso_externo = 'lote'
               and id_externo = p_id_lote_externo;
            insert into public.propiedades (
                nombre, ubicacion, precio, disponibilidad, descripcion,
                empresa_id, tipo_propiedad_id, proyecto_id, medios_autorizados
            )
            values (
                left(trim(p_nombre), 50), left(coalesce(nullif(trim(p_ubicacion), ''), 'Ubicación no especificada'), 500),
                p_precio, p_disponibilidad, left(coalesce(p_descripcion, ''), 2000),
                p_empresa_id, v_tipo_propiedad_id, v_proyecto_id, '{}'
            )
            returning propiedad_id into v_propiedad_id;
        end if;
    end if;

    insert into public.lotes_al_mando_mappings
        (empresa_id, recurso_externo, id_externo, proyecto_id, propiedad_id, sincronizado_en)
    values
        (p_empresa_id, 'lote', p_id_lote_externo, null, v_propiedad_id, now())
    on conflict (empresa_id, recurso_externo, id_externo)
    do update set proyecto_id = null,
                  propiedad_id = excluded.propiedad_id,
                  sincronizado_en = now();

    return v_propiedad_id;
end;
$$;

create or replace function public.sync_lotes_al_mando_inventory(
    p_empresa_id bigint,
    p_proyectos jsonb,
    p_lotes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_item jsonb;
    v_projects integer := 0;
    v_lots integer := 0;
begin
    if jsonb_typeof(p_proyectos) <> 'array' or jsonb_typeof(p_lotes) <> 'array' then
        raise exception 'INVALID_LOTES_AL_MANDO_PAYLOAD';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('imvolt:lam:' || p_empresa_id::text, 0));

    for v_item in select value from jsonb_array_elements(p_proyectos)
    loop
        perform public.sync_lotes_al_mando_project(
            p_empresa_id,
            v_item->>'id_externo',
            v_item->>'nombre',
            coalesce((v_item->>'total_lotes')::integer, 0)
        );
        v_projects := v_projects + 1;
    end loop;

    for v_item in select value from jsonb_array_elements(p_lotes)
    loop
        perform public.sync_lotes_al_mando_lot(
            p_empresa_id,
            v_item->>'id_proyecto_externo',
            v_item->>'id_externo',
            v_item->>'nombre',
            v_item->>'ubicacion',
            (v_item->>'precio')::numeric,
            v_item->>'disponibilidad',
            v_item->>'descripcion'
        );
        v_lots := v_lots + 1;
    end loop;

    return jsonb_build_object('proyectos_sincronizados', v_projects, 'lotes_sincronizados', v_lots);
end;
$$;

revoke all on function public.sync_lotes_al_mando_project(bigint, text, text, integer) from public, anon, authenticated;
revoke all on function public.sync_lotes_al_mando_lot(bigint, text, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.sync_lotes_al_mando_inventory(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_lotes_al_mando_project(bigint, text, text, integer) to service_role;
grant execute on function public.sync_lotes_al_mando_lot(bigint, text, text, text, text, numeric, text, text) to service_role;
grant execute on function public.sync_lotes_al_mando_inventory(bigint, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
