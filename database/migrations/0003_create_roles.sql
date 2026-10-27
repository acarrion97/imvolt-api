-- =============================================================================
-- Migración 0003 — tabla roles
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Catálogo del RBAC: propietario | administrador | marketing | agente | lector.
-- =============================================================================

create table if not exists public.roles (
    rol_id         bigserial primary key,
    nombre         varchar(30) not null unique,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
