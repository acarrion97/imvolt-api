-- =============================================================================
-- Migración 0015 — tabla plantillas
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Creativos alineados al prototipo IMVOLT.
-- =============================================================================

create table if not exists public.plantillas (
    plantilla_id       bigserial primary key,
    nombre             varchar(50) not null,
    descripcion        text,
    url_logo           varchar(200),
    tipo_plantilla_id  bigint not null references public.tipos_plantillas (tipo_plantilla_id),
    estado             varchar(20) not null default 'activo',
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

create index if not exists idx_plantillas_tipo on public.plantillas (tipo_plantilla_id);
