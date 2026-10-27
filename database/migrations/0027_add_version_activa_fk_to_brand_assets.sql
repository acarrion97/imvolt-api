-- =============================================================================
-- Migración 0027 — FK fk_brand_asset_version_activa
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- FK con nombre EXPLÍCITO hacia la versión activa del archivo. Se agrega con ALTER
-- (y no en el create) para declarar ambas tablas en orden.
-- 
-- Su nombre fijo permite a PostgREST incrustarla:
--   brand_asset_versions!fk_brand_asset_version_activa(*)
-- =============================================================================

alter table public.brand_assets
    add constraint fk_brand_asset_version_activa
    foreign key (version_activa_id)
    references public.brand_asset_versions (brand_asset_version_id)
    on delete set null;
