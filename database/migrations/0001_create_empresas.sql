-- =============================================================================
-- Migración 0001 — tabla empresas
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Tenant raíz: todo el dato del API se acota por empresa_id.
-- =============================================================================

create table if not exists public.empresas (
    empresa_id      bigserial primary key,
    razon_social    varchar(120) not null,
    -- El RUC puede quedar pendiente al registrar la cuenta.
    ruc             varchar(13),
    estado          varchar(20) not null default 'activo',
    creado_en       timestamptz not null default now(),
    actualizado_en  timestamptz not null default now()
);
