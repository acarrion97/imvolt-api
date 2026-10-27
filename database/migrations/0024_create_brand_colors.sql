-- =============================================================================
-- Migración 0024 — tabla brand_colors
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Paleta de colores corporativa; el frontend respeta el campo `orden`.
-- =============================================================================

create table if not exists public.brand_colors (
    brand_color_id bigserial primary key,
    nombre         varchar(50) not null,
    -- Código hexadecimal del color: #RRGGBB.
    hex            varchar(7) not null,
    -- Rol del color dentro de la identidad (catálogo fijo en el modelo).
    uso            varchar(30) not null default 'principal',
    -- Orden de presentación en la paleta (el frontend lo respeta).
    orden          integer not null default 0,
    empresa_id     bigint not null references public.empresas (empresa_id) on delete cascade,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create index if not exists idx_brand_colors_empresa on public.brand_colors (empresa_id);
