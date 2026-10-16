// controllers/property.controller.ts
// CRUD del módulo Propiedades: catálogo de inmuebles (RF-02) y sus tipos.

import { createCrudRouter } from '../core/crud.factory';
import { propiedadRequest, tipoPropiedadRequest } from '../requests/property.request';
import { propiedadResource, tipoPropiedadResource } from '../resources/property.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { assignEmpresaOnCreate, filterByEmpresa } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin } from '../middlewares/requireRole';

// ── Tipos de propiedad (catálogo compartido) ────────────────────────────────
export const { router: tipoPropiedadRouter } = createCrudRouter({
  table: 'tipos_propiedades',
  primaryKey: 'tipo_propiedad_id',
  request: tipoPropiedadRequest,
  resource: tipoPropiedadResource,
  entityName: 'Tipo de propiedad',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});

// ── Propiedades ─────────────────────────────────────────────────────────────
export const { router: propiedadRouter } = createCrudRouter({
  table: 'propiedades',
  primaryKey: 'propiedad_id',
  joins: ['empresas(*)', 'tipos_propiedades(*)'],
  request: propiedadRequest,
  resource: propiedadResource,
  entityName: 'Propiedad',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByOwnerOrAdmin, assignEmpresaOnCreate],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});
