-- =============================================================================
-- Migración 0006 — tabla roles_permisos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Matriz rol ⇄ permiso que resuelve el middleware de autorización.
-- =============================================================================

create table if not exists public.roles_permisos (
    permiso_rol_id bigserial primary key,
    rol_id         bigint not null references public.roles (rol_id) on delete cascade,
    permiso_id     bigint not null references public.permisos (permiso_id) on delete cascade,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (rol_id, permiso_id)
);

create index if not exists idx_roles_permisos_rol on public.roles_permisos (rol_id);
