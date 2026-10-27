-- =============================================================================
-- Migración 0002 — tabla usuarios
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- La autenticación vive en Supabase Auth; aquí solo la fila local.
-- =============================================================================

create table if not exists public.usuarios (
    usuario_id                   bigserial primary key,
    nombre                       varchar(120) not null,
    email                        varchar(120) not null unique,
    telefono                     varchar(20),
    empresa_id                   bigint not null references public.empresas (empresa_id),
    contrasenia_temporal_hasta   timestamptz,
    estado                       varchar(20) not null default 'activo',
    creado_en                    timestamptz not null default now(),
    actualizado_en               timestamptz not null default now()
);

create index if not exists idx_usuarios_empresa on public.usuarios (empresa_id);
create index if not exists idx_usuarios_email  on public.usuarios (email);
