-- =============================================================================
-- Migración 0033 — semilla de objetivo_publicidad
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- =============================================================================

insert into public.objetivo_publicidad (nombre) values
    ('Mensajes'), ('Formularios'), ('Visitas'), ('Tráfico'), ('Branding')
on conflict do nothing;
