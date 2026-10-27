-- =============================================================================
-- Migración 0017 — tabla enfoques_comerciales
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Ángulo de venta del contenido generado.
-- =============================================================================

create table if not exists public.enfoques_comerciales (
    enfoque_comercial_id bigserial primary key,
    nombre               varchar(50) not null,
    descripcion          text,
    estado               varchar(20) not null default 'activo',
    creado_en            timestamptz not null default now(),
    actualizado_en       timestamptz not null default now()
);
