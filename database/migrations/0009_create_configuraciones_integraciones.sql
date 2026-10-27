-- =============================================================================
-- Migración 0009 — tabla configuraciones_integraciones
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Credenciales por proveedor; el API las enmascara en auditoría.
-- =============================================================================

create table if not exists public.configuraciones_integraciones (
    configuracion_integracion_id bigserial primary key,
    url_base                     varchar(200) not null,
    api_key                      varchar(200) not null,
    entorno                      varchar(20) not null,
    api_id                       varchar(100),
    app_secret                   varchar(200),
    access_token                 varchar(500),
    estado                       varchar(20) not null default 'activo',
    creado_en                    timestamptz not null default now(),
    actualizado_en               timestamptz not null default now()
);
