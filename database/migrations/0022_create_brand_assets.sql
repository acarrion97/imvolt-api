-- =============================================================================
-- Migración 0022 — tabla brand_assets
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Archivos de marca de la empresa (logos y otros) con control de versiones.
-- version_activa_id apunta a la versión activa; su FK con nombre se agrega en la
-- migración 0027 (una vez exista brand_asset_versions).
-- =============================================================================

create table if not exists public.brand_assets (
    brand_asset_id    bigserial primary key,
    nombre            varchar(80) not null,
    -- Categoría del archivo (catálogo fijo en src/models/brandkit/brandkit.model.ts).
    categoria         varchar(30) not null default 'logo',
    descripcion       text,
    -- Puntero a la VERSIÓN ACTIVA. La FK nombrada viene en la migración 0027.
    version_activa_id bigint,
    empresa_id        bigint not null references public.empresas (empresa_id) on delete cascade,
    estado            varchar(20) not null default 'activo',
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);

create index if not exists idx_brand_assets_empresa   on public.brand_assets (empresa_id);
create index if not exists idx_brand_assets_categoria on public.brand_assets (categoria);
