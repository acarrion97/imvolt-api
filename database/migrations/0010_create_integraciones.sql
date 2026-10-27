-- =============================================================================
-- Migración 0010 — tabla integraciones
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Catálogo de proveedores integrables. NO tiene CRUD: se alimenta con semilla.
-- =============================================================================

create table if not exists public.integraciones (
    integracion_id bigserial primary key,
    nombre         varchar(50) not null,
    proveedor      varchar(50),
    descripcion    text,
    activa         boolean not null default true,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
