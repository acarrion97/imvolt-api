-- Endurecimiento multiempresa (rama claude/security-hardening).
-- EJECUTAR ANTES de desplegar esta versión del API: el código filtra por
-- `contactos.empresa_id` y `configuraciones_integraciones.empresa_id`.
-- Idempotente: se puede ejecutar más de una vez.

-- 1) contactos: el tenant deja de inferirse de la propiedad (que puede ser null).
alter table public.contactos
    add column if not exists empresa_id bigint references public.empresas (empresa_id) on delete cascade;

update public.contactos c
   set empresa_id = p.empresa_id
  from public.propiedades p
 where c.propiedad_id = p.propiedad_id
   and c.empresa_id is null;

create index if not exists idx_contactos_empresa on public.contactos (empresa_id);

-- 2) configuraciones_integraciones: guarda credenciales de terceros y no tenía dueño.
alter table public.configuraciones_integraciones
    add column if not exists empresa_id bigint references public.empresas (empresa_id) on delete cascade;

update public.configuraciones_integraciones ci
   set empresa_id = ei.empresa_id
  from public.empresas_integraciones ei
 where ei.configuracion_integracion_id = ci.configuracion_integracion_id
   and ci.empresa_id is null;

create index if not exists idx_config_integraciones_empresa on public.configuraciones_integraciones (empresa_id);

-- Las filas que sigan con empresa_id NULL (contactos sin propiedad, credenciales
-- sin vincular) quedan INVISIBLES para el API (fail-closed). Asígnalas a mano:
--   select * from public.contactos where empresa_id is null;
--   select * from public.configuraciones_integraciones where empresa_id is null;
