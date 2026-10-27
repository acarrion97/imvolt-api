-- =============================================================================
-- Migración 0034 — semilla de hitos_lanzamientos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- =============================================================================

insert into public.hitos_lanzamientos (nombre, descripcion, orden, obligatorio) values
    ('Fotografía profesional', 'Sesión autorizada de fotos originales del inmueble', 1, true),
    ('Renders conceptuales', 'Imágenes generadas, identificadas como representación conceptual', 2, false),
    ('Ficha publicada', 'Propiedad visible en el catálogo con precio y disponibilidad verificados', 3, true),
    ('Campañas activas', 'Al menos una campaña en pausa aprobada y lista para publicar', 4, false)
on conflict do nothing;
