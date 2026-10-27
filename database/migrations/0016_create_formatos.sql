-- =============================================================================
-- Migración 0016 — tabla formatos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Relaciones de salida para Reels, feed, carrusel y YouTube.
-- =============================================================================

create table if not exists public.formatos (
    formato_id     bigserial primary key,
    nombre         varchar(50) not null,
    descripcion    text,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
