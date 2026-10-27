-- =============================================================================
-- Migración 0026 — columna medios_autorizados en propiedades
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Canales de publicación donde la empresa AUTORIZA difundir la propiedad.
-- Catálogo fijo validado por el API (src/models/property/propiedad.model.ts):
--   meta_ads | facebook | instagram | whatsapp | tiktok | youtube | portal_web | email
-- 
-- Es un ALTER separado para poder agregarlo a tablas creadas en versiones
-- anteriores sin la columna (add column if not exists = idempotente).
-- =============================================================================

alter table public.propiedades
    add column if not exists medios_autorizados text[] not null default '{}';
