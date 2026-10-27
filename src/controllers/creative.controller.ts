// controllers/creative.controller.ts
// CRUD del módulo Creative (IMVOLT Studio): tipos de plantilla, plantillas,
// formatos, enfoques comerciales y contenidos generados con IA.

import { Request, RequestHandler, Response } from 'express';
import supabase from '../config/supabaseClient';
import { BaseService, auditContext, createCrudRouter, errorResponse, HttpError, NotFoundError, ValidationError } from '../core';
import {
  contenidoIaRequest,
  enfoqueComercialRequest,
  formatoRequest,
  generacionRequest,
  modeloRequest,
  plantillaRequest,
  tipoPlantillaRequest,
} from '../requests/creative.request';
import {
  contenidoIaResource,
  enfoqueComercialResource,
  formatoResource,
  generacionResource,
  modeloResource,
  plantillaResource,
  tipoPlantillaResource,
} from '../resources/creative.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { requirePermission, writeByMarketing, writeByPlatformAdmin } from '../middlewares/requireRole';
import { filterByEmpresa, requireOwnedRef } from '../middlewares/tenantScope';
import { translateBody, translateQuery } from '../middlewares/contract';
import { Generacion, ESTADOS_FINALES } from '../models/creative/generacion.model';
import { creditsService } from '../services/credits.service';
import { higgsfieldService } from '../services/higgsfield.service';
import { config } from '../config/global';

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

// ── Catálogo vivo de modelos IA ────────────────────────────────────────────
export const { router: modeloRouter } = createCrudRouter({
  table: 'modelos_ia',
  primaryKey: 'modelo_id',
  request: modeloRequest,
  resource: modeloResource,
  entityName: 'Modelo IA',
  middlewares: [...requireOrg],
  disabled: ['create', 'update', 'remove'],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: true },
});

const generationFields = {
  property_id: 'propiedad_id',
  template_id: 'plantilla_id',
  model_id: 'modelo_id',
};

const generationService = new BaseService<Generacion>('generaciones', 'generacion_id');

const generationCreate: RequestHandler = async (req, res) => {
  let generation: Generacion | undefined;
  let charged = false;
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión no iniciada');
    const payload = generacionRequest.validateCreate(req.body);
    const { data: model, error: modelError } = await supabase
      .from('modelos_ia')
      .select('*')
      .eq('modelo_id', payload.modelo_id)
      .maybeSingle();
    if (modelError) throw new Error(modelError.message);
    if (!model || model.estado !== 'activo') throw new NotFoundError('Modelo IA disponible');

    const params = payload.parametros as Record<string, unknown>;
    const duration = Number(params.duration ?? model.duracion_min_s ?? 5);
    if (model.tipo_media === 'video' && (!Number.isFinite(duration) || duration <= 0 ||
      (model.duracion_min_s != null && duration < model.duracion_min_s) ||
      (model.duracion_max_s != null && duration > model.duracion_max_s))) {
      throw new ValidationError('Duración de video fuera de los límites del modelo', [
        { field: 'parametros.duration', message: `Usa una duración entre ${model.duracion_min_s} y ${model.duracion_max_s} segundos.` },
      ]);
    }
    if (params.ratio && Array.isArray(model.ratios) && !model.ratios.includes(String(params.ratio))) {
      throw new ValidationError('Formato de imagen no soportado por el modelo', [
        { field: 'parametros.ratio', message: 'Selecciona una relación de aspecto disponible para este modelo.' },
      ]);
    }

    const creditCost = Number(model.creditos_cotizacion) + (
      model.tipo_media === 'video' ? Math.max(0, Math.ceil(duration / 5) - 1) : 0
    );
    generation = await generationService.create<Generacion>({
      empresa_id: Number(req.organizationId),
      propiedad_id: payload.propiedad_id ?? null,
      plantilla_id: payload.plantilla_id ?? null,
      modelo_id: payload.modelo_id,
      modo: payload.modo,
      prompt: payload.prompt,
      parametros: params,
      estado: 'created',
      creditos_costo: creditCost,
      peticion_proveedor_id: null,
      error_mensaje: null,
    }, auditContext(req));

    try {
      await creditsService.confirm(req.organizationId, creditCost, String(generation.generacion_id));
      charged = true;
    } catch (error) {
      await generationService.remove(generation.generacion_id, auditContext(req));
      generation = undefined;
      throw error;
    }

    const job = await higgsfieldService.createJob({
      provider_model_id: model.modelo_proveedor_id,
      media_type: model.tipo_media,
      prompt: payload.prompt,
      image_url: typeof params.image_url === 'string' ? params.image_url : undefined,
      duration: model.tipo_media === 'video' ? duration : undefined,
      ratio: typeof params.ratio === 'string' ? params.ratio : undefined,
      resolution: typeof params.resolution === 'string' ? params.resolution : undefined,
    });

    const completed = config.higgsfield.simulate;
    const updated = await generationService.update<Generacion>(generation.generacion_id, {
      estado: completed ? 'completed' : job.status,
      peticion_proveedor_id: job.request_id,
      error_mensaje: null,
    }, auditContext(req));
    res.status(201).json(generacionResource.format(updated));
  } catch (error) {
    if (generation && charged) {
      try {
        await creditsService.refund(req.organizationId as string, generation.creditos_costo, String(generation.generacion_id));
        await generationService.update(generation.generacion_id, {
          estado: 'failed',
          error_mensaje: error instanceof Error ? error.message.slice(0, 1000) : 'No se pudo iniciar la generación',
        });
      } catch (compensationError) {
        console.error('[generaciones] No se pudo compensar una generación fallida', compensationError);
      }
    }
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

const generationGetById: RequestHandler = async (req, res) => {
  try {
    const generation = await generationService.getById<Generacion>(req.params.id);
    if (!ESTADOS_FINALES.has(generation.estado) && generation.peticion_proveedor_id) {
      const status = await higgsfieldService.getStatus(generation.peticion_proveedor_id);
      if (status.status === 'failed') {
        await creditsService.refund(
          String(generation.empresa_id),
          generation.creditos_costo,
          String(generation.generacion_id),
        );
        const updated = await generationService.update<Generacion>(generation.generacion_id, {
          estado: 'failed',
          error_mensaje: status.error ?? 'El proveedor no pudo completar la generación',
        });
        res.json(generacionResource.format(updated));
        return;
      }
      if (status.status !== generation.estado) {
        const updated = await generationService.update<Generacion>(generation.generacion_id, {
          estado: status.status,
        });
        res.json(generacionResource.format(updated));
        return;
      }
    }
    res.json(generacionResource.format(generation));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

export const { router: generacionRouter } = createCrudRouter({
  table: 'generaciones',
  primaryKey: 'generacion_id',
  service: generationService,
  request: generacionRequest,
  resource: generacionResource,
  entityName: 'Generación',
  middlewares: [...requireOrg, filterByEmpresa, translateQuery(generationFields)],
  writeMiddlewares: [
    writeByMarketing,
    requirePermission('crear_contenidos'),
    translateBody(generationFields),
    requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id'),
  ],
  handlers: { create: generationCreate, getById: generationGetById },
  disabled: ['update', 'remove'],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});
