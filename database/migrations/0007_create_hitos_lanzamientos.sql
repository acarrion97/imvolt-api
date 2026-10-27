-- =============================================================================
-- Migración 0007 — tabla hitos_lanzamientos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Checklist de lanzamiento que cada empresa debe cumplir.
-- =============================================================================

create table if not exists public.hitos_lanzamientos (
    hito_lanzamiento_id bigserial primary key,
    nombre              varchar(60) not null,
    descripcion         text not null,
    orden               integer not null,
    obligatorio         boolean not null default false,
    estado              varchar(20) not null default 'activo',
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now()
);
