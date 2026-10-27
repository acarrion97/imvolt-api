-- =============================================================================
-- Migración 0035 — semilla de integraciones
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Catálogo de proveedores integrables (tabla de apoyo, sin CRUD).
-- =============================================================================

insert into public.integraciones (nombre, proveedor, descripcion) values
    ('Meta Ads', 'Meta', 'Publicación de campañas en Facebook e Instagram'),
    ('WhatsApp Business', 'Meta', 'Conversaciones con prospectos desde anuncios'),
    ('Higgsfield', 'Higgsfield', 'Generación de imagen y video con IA')
on conflict do nothing;
