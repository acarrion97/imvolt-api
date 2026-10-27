// controllers/property.controller.ts
// CRUD del módulo Propiedades: catálogo de inmuebles (RF-02) y sus tipos.

import { createCrudRouter } from '../core/crud.factory';
import { propiedadRequest, tipoPropiedadRequest } from '../requests/property.request';
import { propiedadResource, tipoPropiedadResource } from '../resources/property.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByEmpresa, forceEmpresa, requireOwnedRef } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin, writeByPlatformAdmin } from '../middlewares/requireRole';

// ── Tipos de propiedad (catálogo compartido) ────────────────────────────────
export const { router: tipoPropiedadRouter } = createCrudRouter({
  table: 'tipos_propiedades',
  primaryKey: 'tipo_propiedad_id',
  request: tipoPropiedadRequest,
  resource: tipoPropiedadResource,
  entityName: 'Tipo de propiedad',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByPlatformAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});

// ── Propiedades ─────────────────────────────────────────────────────────────
export const { router: propiedadRouter } = createCrudRouter({
  table: 'propiedades',
  primaryKey: 'propiedad_id',
  joins: ['empresas(*)', 'tipos_propiedades(*)', 'proyectos(*)'],
  request: propiedadRequest,
  resource: propiedadResource,
  entityName: 'Propiedad',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [
    writeByOwnerOrAdmin,
    forceEmpresa,
    requireOwnedRef('proyecto_id', 'proyectos', 'proyecto_id'),
  ],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // GET/PATCH/DELETE /propiedades/:id solo dentro de la empresa activa.
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});
