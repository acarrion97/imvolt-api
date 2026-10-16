// controllers/identity.controller.ts
// CRUD del módulo Identidad (diagrama relacional):
// empresas, usuarios, roles, permisos, asignaciones rol↔usuario y rol↔permiso,
// hitos de lanzamiento, configuraciones de integración y sus vínculos.
//
// El CRUD genérico vive en `core/crud.factory`: cada export es un router
// Express completo (GET /, GET /:id, POST /, PUT /:id, PATCH /:id, DELETE /:id)
// con validación (Request), vista de respuesta (Resource), sesión y RBAC.

import { createCrudRouter } from '../core/crud.factory';
import {
  configuracionIntegracionRequest,
  empresaHitoRequest,
  empresaIntegracionRequest,
  empresaRequest,
  hitoLanzamientoRequest,
  permisoRequest,
  rolPermisoRequest,
  rolRequest,
  usuarioRequest,
  usuarioRolRequest,
} from '../requests/identity.request';
import {
  auditLogResource,
  configuracionIntegracionResource,
  empresaHitoResource,
  empresaIntegracionResource,
  empresaResource,
  hitoLanzamientoResource,
  permisoResource,
  rolPermisoResource,
  rolResource,
  usuarioResource,
  usuarioRolResource,
} from '../resources/identity.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { assignEmpresaOnCreate, filterByEmpresa } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin } from '../middlewares/requireRole';

const SEGMENTO = {
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
};

// ── Empresas (tenant) ───────────────────────────────────────────────────────
export const { router: empresaRouter } = createCrudRouter({
  table: 'empresas',
  primaryKey: 'empresa_id',
  request: empresaRequest,
  resource: empresaResource,
  entityName: 'Empresa',
  ...SEGMENTO,
});

// ── Usuarios ────────────────────────────────────────────────────────────────
export const { router: usuarioRouter } = createCrudRouter({
  table: 'usuarios',
  primaryKey: 'usuario_id',
  joins: ['empresas(*)'],
  request: usuarioRequest,
  resource: usuarioResource,
  entityName: 'Usuario',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByOwnerOrAdmin, assignEmpresaOnCreate],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});

// ── Roles ───────────────────────────────────────────────────────────────────
export const { router: rolRouter } = createCrudRouter({
  table: 'roles',
  primaryKey: 'rol_id',
  request: rolRequest,
  resource: rolResource,
  entityName: 'Rol',
  ...SEGMENTO,
});

// ── Permisos ────────────────────────────────────────────────────────────────
export const { router: permisoRouter } = createCrudRouter({
  table: 'permisos',
  primaryKey: 'permiso_id',
  request: permisoRequest,
  resource: permisoResource,
  entityName: 'Permiso',
  ...SEGMENTO,
});

// ── Roles ↔ Usuarios ────────────────────────────────────────────────────────
export const { router: usuarioRolRouter } = createCrudRouter({
  table: 'roles_usuarios',
  primaryKey: 'usuario_rol_id',
  joins: ['usuarios(*, empresas(*))', 'roles(*)'],
  request: usuarioRolRequest,
  resource: usuarioRolResource,
  entityName: 'Asignación de rol',
  ...SEGMENTO,
});

// ── Roles ↔ Permisos ────────────────────────────────────────────────────────
export const { router: rolPermisoRouter } = createCrudRouter({
  table: 'roles_permisos',
  primaryKey: 'permiso_rol_id',
  joins: ['roles(*)', 'permisos(*)'],
  request: rolPermisoRequest,
  resource: rolPermisoResource,
  entityName: 'Permiso de rol',
  ...SEGMENTO,
});

// ── Hitos de lanzamiento ────────────────────────────────────────────────────
export const { router: hitoLanzamientoRouter } = createCrudRouter({
  table: 'hitos_lanzamientos',
  primaryKey: 'hito_lanzamiento_id',
  request: hitoLanzamientoRequest,
  resource: hitoLanzamientoResource,
  entityName: 'Hito de lanzamiento',
  ...SEGMENTO,
});

// ── Hitos por empresa ───────────────────────────────────────────────────────
export const { router: empresaHitoRouter } = createCrudRouter({
  table: 'empresas_hitos',
  primaryKey: 'empresa_hito_id',
  joins: ['empresas(*)', 'hitos_lanzamientos(*)'],
  request: empresaHitoRequest,
  resource: empresaHitoResource,
  entityName: 'Hito de la empresa',
  ...SEGMENTO,
});

// ── Configuración de integración ────────────────────────────────────────────
export const { router: configuracionIntegracionRouter } = createCrudRouter({
  table: 'configuraciones_integraciones',
  primaryKey: 'configuracion_integracion_id',
  request: configuracionIntegracionRequest,
  resource: configuracionIntegracionResource,
  entityName: 'Configuración de integración',
  ...SEGMENTO,
});

// ── Integraciones por empresa ───────────────────────────────────────────────
export const { router: empresaIntegracionRouter } = createCrudRouter({
  table: 'empresas_integraciones',
  primaryKey: 'empresa_integracion_id',
  joins: ['empresas(*)', 'integraciones(*)', 'configuraciones_integraciones(*)'],
  request: empresaIntegracionRequest,
  resource: empresaIntegracionResource,
  entityName: 'Integración de la empresa',
  ...SEGMENTO,
});

// ── Auditoría (SOLO LECTURA) ────────────────────────────────────────────────
// La escribe el núcleo (`services/audit.service.ts`) en cada escritura y en
// el registro/inicio de sesión. Aquí solo se consulta, siempre dentro de la
// empresa activa y solo para propietario y administrador.
export const { router: auditLogRouter } = createCrudRouter({
  table: 'audit_logs',
  primaryKey: 'audit_log_id',
  joins: ['usuarios(*, empresas(*))', 'empresas(*)'],
  resource: auditLogResource,
  entityName: 'Registro de auditoría',
  middlewares: [...requireOrg, filterByEmpresa, writeByOwnerOrAdmin],
  disabled: ['create', 'update', 'remove'],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});
