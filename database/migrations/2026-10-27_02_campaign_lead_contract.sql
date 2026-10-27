-- Contratos REST §10–§11 sobre campanias_publicitarias y contactos existentes.
-- No crea tablas paralelas. Requiere la migración 01. Idempotente.

alter table public.campanias_publicitarias
    add column if not exists empresa_id bigint,
    add column if not exists conexion_id bigint,
    add column if not exists nombre varchar(120),
    add column if not exists destino varchar(20) not null default 'landing',
    add column if not exists moneda varchar(3) not null default 'USD',
    add column if not exists fecha_inicio timestamptz,
    add column if not exists fecha_fin timestamptz,
    add column if not exists titulo varchar(120),
    add column if not exists cta varchar(60),
    add column if not exists creative_url text,
    add column if not exists estado_flujo varchar(20) not null default 'local_draft';

alter table public.campanias_publicitarias
    alter column propiedad_id drop not null,
    alter column duracion_dias drop not null,
    alter column zona_referencia drop not null;

update public.campanias_publicitarias c
set empresa_id = p.empresa_id
from public.propiedades p
where c.empresa_id is null
  and c.propiedad_id = p.propiedad_id
  and p.empresa_id is not null;

update public.campanias_publicitarias
set nombre = 'Campaña #' || campania_publicitaria_id
where nombre is null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'campanias_publicitarias_empresa_fk') then
        alter table public.campanias_publicitarias
            add constraint campanias_publicitarias_empresa_fk
            foreign key (empresa_id) references public.empresas (empresa_id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'campanias_publicitarias_conexion_fk') then
        alter table public.campanias_publicitarias
            add constraint campanias_publicitarias_conexion_fk
            foreign key (conexion_id) references public.conexiones (conexion_id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'campanias_publicitarias_estado_flujo_check') then
        alter table public.campanias_publicitarias
            add constraint campanias_publicitarias_estado_flujo_check
            check (estado_flujo in (
                'local_draft', 'validated', 'awaiting_approval', 'approved',
                'published_paused', 'active', 'rejected', 'failed', 'archived'
            ));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'campanias_publicitarias_destino_check') then
        alter table public.campanias_publicitarias
            add constraint campanias_publicitarias_destino_check
            check (destino in ('whatsapp', 'formulario', 'landing'));
    end if;
end $$;

create index if not exists idx_campanias_empresa
    on public.campanias_publicitarias (empresa_id, creado_en desc);
create index if not exists idx_campanias_estado_flujo
    on public.campanias_publicitarias (estado_flujo);
create index if not exists idx_campanias_conexion
    on public.campanias_publicitarias (conexion_id);

alter table public.contactos
    add column if not exists campania_id bigint,
    add column if not exists notas text,
    add column if not exists referencia_externa varchar(100),
    add column if not exists etapa varchar(20) not null default 'nuevo';

alter table public.contactos alter column correo drop not null;
alter table public.contactos alter column telefono drop not null;
alter table public.contactos alter column telefono type varchar(20);
alter table public.contactos alter column nombres type varchar(60);
alter table public.contactos alter column apellidos type varchar(60);
alter table public.contactos alter column apellidos set default '';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'contactos_campania_fk') then
        alter table public.contactos
            add constraint contactos_campania_fk
            foreign key (campania_id) references public.campanias_publicitarias (campania_publicitaria_id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'contactos_etapa_check') then
        alter table public.contactos
            add constraint contactos_etapa_check
            check (etapa in ('nuevo', 'contactado', 'calificado', 'visitado', 'cerrado', 'perdido'));
    end if;
end $$;

create index if not exists idx_contactos_campania on public.contactos (campania_id);
create index if not exists idx_contactos_etapa on public.contactos (etapa);
create unique index if not exists uq_contactos_referencia_externa
    on public.contactos (empresa_id, referencia_externa)
    where referencia_externa is not null;

notify pgrst, 'reload schema';
