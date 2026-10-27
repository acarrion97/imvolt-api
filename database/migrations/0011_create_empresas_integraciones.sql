-- =============================================================================
-- Migración 0011 — tabla empresas_integraciones
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Vínculo empresa ⇄ proveedor con la referencia de su credencial.
-- =============================================================================

create table if not exists public.empresas_integraciones (
    empresa_integracion_id       bigserial primary key,
    empresa_id                   bigint not null references public.empresas (empresa_id) on delete cascade,
    integracion_id               bigint not null references public.integraciones (integracion_id),
    configuracion_integracion_id bigint not null references public.configuraciones_integraciones (configuracion_integracion_id),
    referencia_credencial        text not null,
    estado                       varchar(20) not null default 'activo',
    creado_en                    timestamptz not null default now(),
    actualizado_en               timestamptz not null default now(),
    unique (empresa_id, integracion_id)
);

create index if not exists idx_empresas_int_empresa on public.empresas_integraciones (empresa_id);
