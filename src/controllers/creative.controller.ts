// controllers/creative.controller.ts
// CRUD del módulo Creative (IMVOLT Studio): tipos de plantilla, plantillas,
// formatos, enfoques comerciales y contenidos generados con IA.

import { createCrudRouter } from '../core/crud.factory';
import {
  contenidoIaRequest,
  enfoqueComercialRequest,
  formatoRequest,
  plantillaRequest,
  tipoPlantillaRequest,
} from '../requests/creative.request';
import {
  contenidoIaResource,
  enfoqueComercialResource,
  formatoResource,
  plantillaResource,
  tipoPlantillaResource,
} from '../resources/creative.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing, writeByPlatformAdmin } from '../middlewares/requireRole';
import { requireOwnedRef } from '../middlewares/tenantScope';

// Catálogos GLOBALES (tipos, plantillas, formatos, enfoques): sin columna de
// empresa, compartidos por todos los tenants → escritura solo de la plataforma.
const SEGMENTO = {
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByPlatformAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
};

// ── Tipos de plantilla ──────────────────────────────────────────────────────
export const { router: tipoPlantillaRouter } = createCrudRouter({
  table: 'tipos_plantillas',
  primaryKey: 'tipo_plantilla_id',
  request: tipoPlantillaRequest,
  resource: tipoPlantillaResource,
  entityName: 'Tipo de plantilla',
  ...SEGMENTO,
});

// ── Plantillas ──────────────────────────────────────────────────────────────
export const { router: plantillaRouter } = createCrudRouter({
  table: 'plantillas',
  primaryKey: 'plantilla_id',
  joins: ['tipos_plantillas(*)'],
  request: plantillaRequest,
  resource: plantillaResource,
  entityName: 'Plantilla',
  ...SEGMENTO,
});

// ── Formatos ────────────────────────────────────────────────────────────────
export const { router: formatoRouter } = createCrudRouter({
  table: 'formatos',
  primaryKey: 'formato_id',
  request: formatoRequest,
  resource: formatoResource,
  entityName: 'Formato',
  ...SEGMENTO,
});

// ── Enfoques comerciales ────────────────────────────────────────────────────
export const { router: enfoqueComercialRouter } = createCrudRouter({
  table: 'enfoques_comerciales',
  primaryKey: 'enfoque_comercial_id',
  request: enfoqueComercialRequest,
  resource: enfoqueComercialResource,
  entityName: 'Enfoque comercial',
  ...SEGMENTO,
});

// ── Contenidos IA ───────────────────────────────────────────────────────────
export const { router: contenidoIaRouter } = createCrudRouter({
  table: 'contenidos_ia',
  primaryKey: 'contenido_ia_id',
  // La propiedad incrustada a su vez trae su empresa y su tipo (anidamiento).
  joins: ['propiedades(*, empresas(*), tipos_propiedades(*))', 'plantillas(*, tipos_plantillas(*))', 'formatos(*)', 'enfoques_comerciales(*)'],
  request: contenidoIaRequest,
  resource: contenidoIaResource,
  entityName: 'Contenido IA',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByMarketing, requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id')],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // Sin columna de empresa: el dueño es el de su propiedad.
  tenantVia: { fk: 'propiedad_id', table: 'propiedades', pk: 'propiedad_id' },
});
