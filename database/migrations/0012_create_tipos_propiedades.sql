-- =============================================================================
-- Migración 0012 — tabla tipos_propiedades
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Catálogo: Lote | Casa | Departamento | Oficina | Local | Proyecto.
-- =============================================================================

create table if not exists public.tipos_propiedades (
    tipo_propiedad_id bigserial primary key,
    nombre            varchar(30) not null,
    estado            varchar(20) not null default 'activo',
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);
