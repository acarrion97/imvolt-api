-- =============================================================================
-- Migración 0023 — tabla brand_asset_versions
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Versiones de cada archivo. La ruta_storage apunta al bucket brand-kit (privado).
-- =============================================================================

create table if not exists public.brand_asset_versions (
    brand_asset_version_id bigserial primary key,
    brand_asset_id         bigint not null references public.brand_assets (brand_asset_id) on delete cascade,
    -- Número correlativo de la versión dentro del archivo (1 = v1, 2 = v2...).
    numero                 integer not null,
    nombre_archivo         varchar(200) not null,
    -- Ruta dentro del bucket brand-kit (no es una URL pública).
    ruta_storage           varchar(300) not null,
    mime_type              varchar(100),
    tamano_bytes           bigint,
    -- Qué cambió en esta versión (p. ej. "margen de seguridad ampliado").
    nota                   text,
    subido_por             bigint references public.usuarios (usuario_id) on delete set null,
    -- Denormalizado para acotar por tenant sin join.
    empresa_id             bigint not null references public.empresas (empresa_id) on delete cascade,
    estado                 varchar(20) not null default 'activo',
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now(),
    unique (brand_asset_id, numero)
);

create index if not exists idx_brand_versions_asset   on public.brand_asset_versions (brand_asset_id);
create index if not exists idx_brand_versions_empresa on public.brand_asset_versions (empresa_id);
