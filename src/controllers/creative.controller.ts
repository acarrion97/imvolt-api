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
  generacionQuoteRequest,
  modeloRequest,
  plantillaRequest,
  tipoPlantillaRequest,
} from '../requests/creative.request';
import {
  contenidoIaResource,
  enfoqueComercialResource,
  formatoResource,
  generacionResource,
  generationOutputResource,
  modeloResource,
  plantillaResource,
  tipoPlantillaResource,
} from '../resources/creative.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { requirePermission, writeByMarketing, writeByPlatformAdmin } from '../middlewares/requireRole';
import { filterByEmpresa, requireOwnedRef } from '../middlewares/tenantScope';
import { translateBody, translateQuery } from '../middlewares/contract';
import {
  Generacion,
  ESTADOS_FINALES,
  puedeTransicionarGeneracion,
  type GeneracionEstado,
} from '../models/creative/generacion.model';
import { getCompanyIntegrationConfig } from '../services/integration-config.service';
import { HiggsfieldCredentials, higgsfieldService } from '../services/higgsfield.service';

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

async function persistGenerationOutputs(
  generation: Generacion,
  urls: string[],
): Promise<void> {
  const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (uniqueUrls.length === 0) return;

  const { data: model, error: modelError } = await supabase
    .from('modelos_ia')
    .select('tipo_media')
    .eq('modelo_id', generation.modelo_id)
    .maybeSingle();
  if (modelError) throw new Error(modelError.message);
  if (!model) throw new NotFoundError('Modelo IA');

  const outputs = uniqueUrls.map((outputUrl, outputIndex) => ({
    generation_id: generation.generacion_id,
    output_index: outputIndex,
    media_type: model.tipo_media,
    output_url: outputUrl,
  }));
  const { error } = await supabase
    .from('generation_outputs')
    .upsert(outputs, { onConflict: 'generation_id,output_index' });
  if (error) throw new Error(`No se pudieron guardar los resultados de la generación: ${error.message}`);
}

const generationOutputsGet: RequestHandler = async (req, res) => {
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión no iniciada');
    const generation = await generationService.getById<Generacion>(req.params.id);
    if (String(generation.empresa_id) !== req.organizationId) {
      throw new NotFoundError('Generación');
    }

    const { data, error } = await supabase
      .from('generation_outputs')
      .select('*')
      .eq('generation_id', generation.generacion_id)
      .order('output_index', { ascending: true });
    if (error) throw new Error(error.message);
    res.json(generationOutputResource.formatMany(data ?? []));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

async function higgsfieldCredentials(empresaId: string): Promise<HiggsfieldCredentials | undefined> {
  const integration = await getCompanyIntegrationConfig(empresaId, 'Higgsfield');
  if (!integration) return undefined;

  const entorno = integration.entorno.trim().toLowerCase();
  if (['sandbox', 'desarrollo', 'test'].includes(entorno)) return undefined;
  if (!['produccion', 'production', 'prod'].includes(entorno)) {
    throw new HttpError(503, 'El entorno de la conexión Higgsfield debe ser produccion o sandbox.');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(integration.url_base);
  } catch {
    throw new HttpError(503, 'La URL de Higgsfield configurada para esta empresa no es válida.');
  }
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.hostname !== 'api.higgsfield.ai' ||
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new HttpError(503, 'La URL de Higgsfield debe ser https://api.higgsfield.ai.');
  }
  if (!integration.api_key?.trim() || !integration.app_secret?.trim()) {
    throw new HttpError(503, 'La conexión activa de Higgsfield no tiene configurados el API Key ID y el secreto.');
  }

  return {
    baseUrl: 'https://api.higgsfield.ai',
    apiKeyId: integration.api_key,
    apiKeySecret: integration.app_secret,
  };
}

function quoteGeneration(model: {
  tipo_media: string;
  modelo_proveedor_id: string;
  precio_usd: number | null;
  precio_unidad: 'imagen' | 'segundo' | null;
  duracion_min_s: number | null;
  duracion_max_s: number | null;
  ratios: unknown;
}, params: Record<string, unknown>): number {
  const duration = Number(params.duration ?? model.duracion_min_s ?? 5);
  if (model.tipo_media === 'video' && (!Number.isFinite(duration) || duration <= 0 ||
    (model.duracion_min_s != null && duration < model.duracion_min_s) ||
    (model.duracion_max_s != null && duration > model.duracion_max_s))) {
    throw new ValidationError('Duración de video fuera de los límites del modelo', [
      { field: 'parametros.duration', message: `Usa una duración entre ${model.duracion_min_s} y ${model.duracion_max_s} segundos.` },
    ]);
  }
  if (['kling-video/v2.6/pro/text-to-video', 'higgsfield/veo3-video']
    .includes(model.modelo_proveedor_id) &&
    duration !== 5 && duration !== 10) {
    throw new ValidationError('Duración no soportada por el modelo', [
      { field: 'parametros.duration', message: 'Kling 2.6 admite únicamente 5 o 10 segundos.' },
    ]);
  }
  if (params.ratio && Array.isArray(model.ratios) && !model.ratios.includes(String(params.ratio))) {
    throw new ValidationError('Formato no soportado por el modelo', [
      { field: 'parametros.ratio', message: 'Selecciona una relación de aspecto disponible para este modelo.' },
    ]);
  }
  if (
    model.precio_usd == null ||
    model.precio_usd <= 0 ||
    (model.tipo_media === 'image' && model.precio_unidad !== 'imagen') ||
    (model.tipo_media === 'video' && model.precio_unidad !== 'segundo')
  ) {
    throw new ValidationError('El modelo no tiene un precio por generación configurado', [
      { field: 'model_id', message: 'Selecciona un modelo con precio en USD configurado.' },
    ]);
  }
  const units = model.tipo_media === 'video' ? duration : 1;
  return Number((Number(model.precio_usd) * units).toFixed(4));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const generationQuote: RequestHandler = async (req, res) => {
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión no iniciada');
    const payload = generacionQuoteRequest.validateCreate(req.body);
    const { data: model, error } = await supabase
      .from('modelos_ia')
      .select('*')
      .eq('modelo_id', payload.modelo_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!model || model.estado !== 'activo') throw new NotFoundError('Modelo IA disponible');

    const priceUsd = quoteGeneration(
      model,
      payload.parametros as Record<string, unknown>,
    );
    res.json({
      model_id: String(model.modelo_id),
      price_usd: priceUsd,
      currency: 'USD',
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

const generationCreate: RequestHandler = async (req, res) => {
  let generation: Generacion | undefined;
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión no iniciada');
    const payload = generacionRequest.validateCreate(req.body);
    const params = payload.parametros as Record<string, unknown>;
    const existing = await generationService.findOne<Generacion>({
      empresa_id: Number(req.organizationId),
      idempotency_key: payload.idempotency_key,
    });
    if (existing) {
      const sameRequest =
        existing.modelo_id === Number(payload.modelo_id) &&
        existing.propiedad_id === (payload.propiedad_id ?? null) &&
        existing.plantilla_id === (payload.plantilla_id ?? null) &&
        existing.modo === payload.modo &&
        existing.prompt === payload.prompt &&
        existing.precio_usd != null &&
        Number(existing.precio_usd) === payload.quoted_price_usd &&
        canonicalJson(existing.parametros) === canonicalJson(params);
      if (!sameRequest) throw new HttpError(409, 'La clave de idempotencia ya se usó con otra generación');
      res.status(200).json(generacionResource.format(existing));
      return;
    }

    const { data: model, error: modelError } = await supabase
      .from('modelos_ia')
      .select('*')
      .eq('modelo_id', payload.modelo_id)
      .maybeSingle();
    if (modelError) throw new Error(modelError.message);
    if (!model || model.estado !== 'activo') throw new NotFoundError('Modelo IA disponible');

    const priceUsd = quoteGeneration(model, params);
    const duration = Number(params.duration ?? model.duracion_min_s ?? 5);
    if (payload.quoted_price_usd !== priceUsd) {
      throw new HttpError(409, 'El precio cambió. Vuelve a cotizar antes de aceptar la generación.', {
        quoted_price_usd: payload.quoted_price_usd,
        current_price_usd: priceUsd,
      });
    }
    generation = await generationService.create<Generacion>({
      empresa_id: Number(req.organizationId),
      propiedad_id: payload.propiedad_id ?? null,
      plantilla_id: payload.plantilla_id ?? null,
      modelo_id: payload.modelo_id,
      modo: payload.modo,
      prompt: payload.prompt,
      parametros: params,
      idempotency_key: payload.idempotency_key,
      estado: 'created',
      precio_usd: null,
      peticion_proveedor_id: null,
      error_mensaje: null,
    }, auditContext(req));

    generation = await generationService.update<Generacion>(generation.generacion_id, {
      estado: 'quoted',
      precio_usd: priceUsd,
    }, auditContext(req));

    const credentials = await higgsfieldCredentials(req.organizationId);
    const job = await higgsfieldService.createJob({
      provider_model_id: model.modelo_proveedor_id,
      media_type: model.tipo_media,
      prompt: payload.prompt,
      image_url: typeof params.image_url === 'string' ? params.image_url : undefined,
      duration: model.tipo_media === 'video' ? duration : undefined,
      ratio: typeof params.ratio === 'string' ? params.ratio : undefined,
      resolution: typeof params.resolution === 'string' ? params.resolution : undefined,
    }, String(generation.generacion_id), credentials);

    const updated = await generationService.update<Generacion>(generation.generacion_id, {
      estado: job.status,
      peticion_proveedor_id: job.request_id,
      error_mensaje: null,
    }, auditContext(req));
    res.status(201).json(generacionResource.format(updated));
  } catch (error) {
    if (generation) {
      try {
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
    if (String(generation.empresa_id) !== req.organizationId) {
      throw new NotFoundError('Generación');
    }
    if (!ESTADOS_FINALES.has(generation.estado) && generation.peticion_proveedor_id) {
      const credentials = generation.peticion_proveedor_id.startsWith('sim_')
        ? undefined
        : await higgsfieldCredentials(String(generation.empresa_id));
      const status = await higgsfieldService.getStatus(generation.peticion_proveedor_id, credentials);
      if (status.status === 'completed') {
        const outputUrls = status.result_urls?.length
          ? status.result_urls
          : status.result_url
            ? [status.result_url]
            : [];
        await persistGenerationOutputs(
          generation,
          outputUrls,
        );
      }
      if (status.status === 'failed' || status.status === 'canceled') {
        const finalStatus = status.status === 'canceled' ? 'canceled' : 'failed';
        const updated = await generationService.update<Generacion>(generation.generacion_id, {
          estado: finalStatus,
          error_mensaje: status.error ?? 'El proveedor no pudo completar la generación',
        });
        res.json(generacionResource.format(updated));
        return;
      }
      const nextStatus: GeneracionEstado = status.status;
      const statusCanAdvance =
        status.status === generation.estado ||
        puedeTransicionarGeneracion(generation.estado, nextStatus);
      if ((statusCanAdvance && status.status !== generation.estado) || status.result_url) {
        const updated = await generationService.update<Generacion>(generation.generacion_id, {
          ...(statusCanAdvance ? { estado: nextStatus } : {}),
          parametros: status.result_url
            ? { ...generation.parametros, result_url: status.result_url }
            : generation.parametros,
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
  extraRoutes: (router) => {
    router.post(
      '/quote',
      ...requireOrg,
      translateBody(generationFields),
      generationQuote,
    );
    router.get('/:id/outputs', ...requireOrg, generationOutputsGet);
  },
});
