// controllers/catalog.controller.ts
// Catálogo inmobiliario: proyectos, propiedades, medios y brand kits.
// Módulo `catalog` del documento maestro (§12).

import { createCrudRouter } from '../core/crud.factory';
import { proyectoRequest, propiedadRequest, mediaRequest, brandKitRequest } from '../requests/catalog.request';
import { proyectoResource, propiedadResource, mediaResource, brandKitResource } from '../resources/catalog.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByOrg, assignOrgOnCreate } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin } from '../middlewares/requireRole';

// ── Proyectos ───────────────────────────────────────────────────────────────
export const { router: proyectoRouter } = createCrudRouter({
  table: 'proyectos',
  primaryKey: 'project_id',
  request: proyectoRequest,
  resource: proyectoResource,
  entityName: 'Proyecto',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Propiedades (RF-02 / P0) ────────────────────────────────────────────────
export const { router: propiedadRouter } = createCrudRouter({
  table: 'propiedades',
  primaryKey: 'property_id',
  request: propiedadRequest,
  resource: propiedadResource,
  entityName: 'Propiedad',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Medios (fotos, renders, videos, planos) ─────────────────────────────────
export const { router: mediaRouter } = createCrudRouter({
  table: 'media_assets',
  primaryKey: 'media_id',
  request: mediaRequest,
  resource: mediaResource,
  entityName: 'Medio',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Brand kit (RF-03 / P0) ──────────────────────────────────────────────────
export const { router: brandKitRouter } = createCrudRouter({
  table: 'brand_kits',
  primaryKey: 'brand_kit_id',
  request: brandKitRequest,
  resource: brandKitResource,
  entityName: 'Brand kit',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});
