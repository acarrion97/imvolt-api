-- =============================================================================
-- Migración 0004 — tabla permisos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Catálogo de acciones protegidas por requireRole.
-- =============================================================================

create table if not exists public.permisos (
    permiso_id     bigserial primary key,
    nombre         varchar(60) not null unique,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
