-- =============================================================================
-- Migración 0021 — tabla contactos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Leads captados; la propiedad puede quedar sin asignar (set null).
-- =============================================================================

create table if not exists public.contactos (
    contacto_id   bigserial primary key,
    nombres       varchar(30) not null,
    apellidos     varchar(30) not null,
    correo        varchar(120) not null,
    telefono      varchar(13) not null,
    origen        varchar(20) not null,
    propiedad_id  bigint references public.propiedades (propiedad_id) on delete set null,
    estado        varchar(20) not null default 'activo',
    creado_en     timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create index if not exists idx_contactos_propiedad on public.contactos (propiedad_id);
create index if not exists idx_contactos_origen   on public.contactos (origen);
