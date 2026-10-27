-- =============================================================================
-- Migración 0013 — tabla propiedades
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- El CRUD principal de /api/v1/propiedades.
-- La columna medios_autorizados (canales autorizados de publicación) se agrega en la
-- migración 0026 para no romper tablas creadas en versiones anteriores.
-- =============================================================================

create table if not exists public.propiedades (
    propiedad_id       bigserial primary key,
    nombre             varchar(50) not null,
    ubicacion          text not null,
    precio             numeric(12, 2) not null,
    disponibilidad     varchar(30) not null default 'disponible',
    descripcion        text not null,
    empresa_id         bigint not null references public.empresas (empresa_id),
    tipo_propiedad_id  bigint not null references public.tipos_propiedades (tipo_propiedad_id),
    estado             varchar(20) not null default 'activo',
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

create index if not exists idx_propiedades_empresa on public.propiedades (empresa_id);
create index if not exists idx_propiedades_tipo   on public.propiedades (tipo_propiedad_id);
create index if not exists idx_propiedades_dispon on public.propiedades (disponibilidad);
