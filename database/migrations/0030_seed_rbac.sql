-- =============================================================================
-- Migración 0030 — semilla de RBAC
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Roles, permisos y la matriz rol ⇄ permiso que resuelve requireRole.
-- =============================================================================

-- Roles del RBAC (los usa requireRole: propietario | administrador | marketing |
-- agente | lector).
insert into public.roles (nombre) values
    ('propietario'),
    ('administrador'),
    ('marketing'),
    ('agente'),
    ('lector')
on conflict (nombre) do nothing;

-- Permisos del catálogo.
insert into public.permisos (nombre) values
    ('gestionar_usuarios'),
    ('gestionar_propiedades'),
    ('crear_contenidos'),
    ('gestionar_campanas'),
    ('ver_analitica'),
    ('gestionar_integraciones')
on conflict (nombre) do nothing;

-- El propietario y el administrador heredan todos los permisos.
insert into public.roles_permisos (rol_id, permiso_id)
select r.rol_id, p.permiso_id
from public.roles r
cross join public.permisos p
where r.nombre in ('propietario', 'administrador')
on conflict (rol_id, permiso_id) do nothing;

-- Marketing publica contenidos y campañas; el agente solo ve propiedades.
insert into public.roles_permisos (rol_id, permiso_id)
select r.rol_id, p.permiso_id
from public.roles r
join public.permisos p on p.nombre in ('crear_contenidos', 'gestionar_campanas', 'ver_analitica')
where r.nombre = 'marketing'
on conflict (rol_id, permiso_id) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.rol_id, p.permiso_id
from public.roles r
join public.permisos p on p.nombre in ('gestionar_propiedades', 'ver_analitica')
where r.nombre = 'agente'
on conflict (rol_id, permiso_id) do nothing;
