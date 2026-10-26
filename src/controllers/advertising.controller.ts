// controllers/advertising.controller.ts
// CRUD del módulo Publicidad (IMVOLT Ads): objetivos y campañas publicitarias.

import { createCrudRouter } from '../core/crud.factory';
import { campaniaPublicitariaRequest, objetivoPublicidadRequest } from '../requests/advertising.request';
import { campaniaPublicitariaResource, objetivoPublicidadResource } from '../resources/advertising.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing, writeByPlatformAdmin } from '../middlewares/requireRole';
import { requireOwnedRef } from '../middlewares/tenantScope';

// Catálogo GLOBAL de objetivos: escritura solo de la plataforma.
const SEGMENTO = {
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByPlatformAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
};

// ── Objetivos de publicidad (catálogo compartido) ───────────────────────────
export const { router: objetivoPublicidadRouter } = createCrudRouter({
  table: 'objetivo_publicidad',
  primaryKey: 'objetivo_publicidad_id',
  request: objetivoPublicidadRequest,
  resource: objetivoPublicidadResource,
  entityName: 'Objetivo de publicidad',
  ...SEGMENTO,
});

// ── Campañas publicitarias ──────────────────────────────────────────────────
export const { router: campaniaPublicitariaRouter } = createCrudRouter({
  table: 'campanias_publicitarias',
  primaryKey: 'campania_publicitaria_id',
  joins: ['propiedades(*, empresas(*), tipos_propiedades(*))', 'objetivo_publicidad(*)'],
  request: campaniaPublicitariaRequest,
  resource: campaniaPublicitariaResource,
  entityName: 'Campaña publicitaria',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByMarketing, requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id')],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // Sin columna de empresa: el dueño es el de su propiedad.
  tenantVia: { fk: 'propiedad_id', table: 'propiedades', pk: 'propiedad_id' },
});
