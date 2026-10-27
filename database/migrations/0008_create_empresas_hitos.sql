-- =============================================================================
-- Migración 0008 — tabla empresas_hitos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Progreso del checklist por empresa.
-- =============================================================================

create table if not exists public.empresas_hitos (
    empresa_hito_id     bigserial primary key,
    empresa_id          bigint not null references public.empresas (empresa_id) on delete cascade,
    hito_lanzamiento_id bigint not null references public.hitos_lanzamientos (hito_lanzamiento_id),
    observaciones       text not null,
    estado              varchar(20) not null default 'activo',
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now(),
    unique (empresa_id, hito_lanzamiento_id)
);

create index if not exists idx_empresas_hitos_empresa on public.empresas_hitos (empresa_id);
