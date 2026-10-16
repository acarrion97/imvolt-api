// controllers/advertising.controller.ts
// CRUD del módulo Publicidad (IMVOLT Ads): objetivos y campañas publicitarias.

import { createCrudRouter } from '../core/crud.factory';
import { campaniaPublicitariaRequest, objetivoPublicidadRequest } from '../requests/advertising.request';
import { campaniaPublicitariaResource, objetivoPublicidadResource } from '../resources/advertising.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing } from '../middlewares/requireRole';

const SEGMENTO = {
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByMarketing],
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
  ...SEGMENTO,
});
