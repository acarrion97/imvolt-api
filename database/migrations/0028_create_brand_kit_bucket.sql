-- =============================================================================
-- Migración 0028 — bucket brand-kit
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Bucket PRIVADO de Supabase Storage para los archivos del Brand Kit.
-- Estructura de ruta: empresa_{empresa_id}/{brand_asset_id}/v{numero}-{nombre}
-- 
-- Los permisos del bucket quedan denegados para anon/authenticated (RLS sin
-- políticas): solo el API entra con service role y emite URL firmadas.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('brand-kit', 'brand-kit', false)
on conflict (id) do nothing;
