-- =============================================================================
-- Migración 0005 — tabla roles_usuarios
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Asignación de roles a usuarios dentro de la empresa.
-- =============================================================================

create table if not exists public.roles_usuarios (
    usuario_rol_id bigserial primary key,
    usuario_id     bigint not null references public.usuarios (usuario_id) on delete cascade,
    rol_id         bigint not null references public.roles (rol_id),
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (usuario_id, rol_id)
);

create index if not exists idx_roles_usuarios_usuario on public.roles_usuarios (usuario_id);
create index if not exists idx_roles_usuarios_rol     on public.roles_usuarios (rol_id);
