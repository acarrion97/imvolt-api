-- =============================================================================
-- Migración 0025 — tabla audit_logs
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Bitácora de SÓLO LECTURA desde el API; sobrevive al borrado de usuarios/empresas.
-- =============================================================================

create table if not exists public.audit_logs (
    audit_log_id  bigserial primary key,
    accion        varchar(10) not null,
    tabla         varchar(60) not null,
    -- Id del registro afectado (texto por flexibilidad entre tablas).
    registro_id   varchar(50),
    -- Usuario de Supabase Auth (UUID); puede no existir en usuarios.
    auth_user_id  varchar(36),
    -- Fila local del usuario en usuarios; set null si se borra el usuario.
    usuario_id    bigint references public.usuarios (usuario_id) on delete set null,
    -- Tenant al que pertenece la acción (set null si se borra la empresa).
    empresa_id    bigint references public.empresas (empresa_id) on delete set null,
    -- Payload involucrado, con credenciales enmascaradas por el API.
    detalles      jsonb,
    creado_en     timestamptz not null default now()
);

create index if not exists idx_audit_empresa on public.audit_logs (empresa_id);
create index if not exists idx_audit_usuario on public.audit_logs (usuario_id);
create index if not exists idx_audit_tabla   on public.audit_logs (tabla, accion);
create index if not exists idx_audit_creado  on public.audit_logs (creado_en desc);
