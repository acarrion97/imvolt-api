-- =============================================================================
-- Migración 0031 — semilla de tipos_propiedades
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- =============================================================================

insert into public.tipos_propiedades (nombre) values
    ('Lote'), ('Casa'), ('Departamento'), ('Oficina'), ('Local'), ('Proyecto')
on conflict do nothing;
