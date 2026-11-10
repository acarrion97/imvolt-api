// controllers/advertising.controller.ts
// CRUD del módulo Publicidad (IMVOLT Ads): objetivos y campañas publicitarias.

import { Request, RequestHandler, Response } from 'express';
import supabase from '../config/supabaseClient';
import { createCrudRouter } from '../core/crud.factory';
import { errorResponse, HttpError, NotFoundError, ValidationError } from '../core/errors';
import { logAudit } from '../services/audit.service';
import { getCompanyIntegrationConfig } from '../services/integration-config.service';
import {
  consumeMetaOAuthState,
  createMetaOAuthState,
  deleteMetaUserData,
  decryptMetaToken,
  exchangeMetaCode,
  exchangeMetaSdkToken,
  listMetaPages,
  metaDataDeletionStatusUrl,
  metaOAuthFrontendUrl,
  saveMetaConnections,
  searchMetaAdLocations,
  validateMetaAdResources,
} from '../services/meta-oauth.service';
import { metaService, MetaCredentials } from '../services/meta.service';
import { strategistService } from '../services/strategist.service';
import type { PropiedadEstrategica } from '../services/strategist.service';
import { generarEstrategiaConOpenRouter, GENERATOR_VERSION } from '../services/openrouter.service';
import { obtenerMetricasMeta } from '../services/analytics.service';
import {
  campaignRequest,
  campaniaPublicitariaRequest,
  conexionRequest,
  objetivoPublicidadRequest,
} from '../requests/advertising.request';
import {
  campaignResource,
  campaniaPublicitariaResource,
  conexionResource,
  objetivoPublicidadResource,
} from '../resources/advertising.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { manageIntegrations, requirePermission, writeByMarketing, writeByOwnerOrAdmin, writeByPlatformAdmin } from '../middlewares/requireRole';
import { filterByEmpresa, forceEmpresa, requireOwnedRef } from '../middlewares/tenantScope';
import { limitarPorPlan } from '../middlewares/planLimits';
import { resolveField, translateBody, translateQuery } from '../middlewares/contract';

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

// ── Conexiones de cuentas publicitarias ────────────────────────────────────
async function iniciarOAuthMeta(req: Request, res: Response): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new HttpError(401, 'Sesión de empresa no iniciada.');
    }
    const oauthState = await createMetaOAuthState(req.organizationId);
    res.json(oauthState);
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function completarOAuthMetaSdk(req: Request, res: Response): Promise<void> {
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión de empresa no iniciada.');
    const state = typeof req.body?.state === 'string' ? req.body.state : '';
    const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
    if (!/^[\da-f]{64}$/.test(state) || accessToken.length < 20 || accessToken.length > 4096) {
      throw new ValidationError('La respuesta de Facebook Login no es válida.');
    }

    const result = await exchangeMetaSdkToken(accessToken, state, req.organizationId);
    await guardarConexionMeta(result);
    res.json({ connected: true, accounts_connected: result.accounts.length });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function guardarConexionMeta(result: Awaited<ReturnType<typeof exchangeMetaCode>>): Promise<void> {
  await saveMetaConnections(result);
  await logAudit(
    'conexiones',
    'CREATE',
    null,
    {
      accion: 'meta_oauth_connected',
      cuentas: result.accounts.map(({ id, name }) => ({ id, name })),
    },
    { empresaId: result.empresaId },
  );
}


function redirigirMeta(res: Response, status: string): void {
  try {
    res.redirect(303, metaOAuthFrontendUrl(status));
  } catch {
    res.status(503).json({ message: 'La conexión OAuth de Meta no está configurada.' });
  }
}

async function callbackOAuthMeta(req: Request, res: Response): Promise<void> {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const providerError = typeof req.query.error === 'string' ? req.query.error : '';

  if (!state || state.length !== 64) {
    redirigirMeta(res, 'error');
    return;
  }

  try {
    if (providerError) {
      await consumeMetaOAuthState(state);
      redirigirMeta(res, providerError === 'access_denied' ? 'cancelled' : 'error');
      return;
    }
    if (!code || code.length > 4096) {
      await consumeMetaOAuthState(state);
      redirigirMeta(res, 'error');
      return;
    }

    const result = await exchangeMetaCode(code, state);
    await guardarConexionMeta(result);
    redirigirMeta(res, 'connected');
  } catch (error) {
    const { status } = errorResponse(error);
    redirigirMeta(res, status === 422 ? 'no_accounts' : 'error');
  }
}

async function callbackMetaDataDeletion(req: Request, res: Response): Promise<void> {
  const signedRequest =
    typeof req.body?.signed_request === 'string' ? req.body.signed_request : '';
  try {
    if (!signedRequest || signedRequest.length > 10000) {
      throw new ValidationError('La solicitud de eliminación de Meta no es válida.');
    }
    const confirmationCode = await deleteMetaUserData(signedRequest);
    res.json({
      url: metaDataDeletionStatusUrl(confirmationCode),
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function listarPaginasMeta(req: Request, res: Response): Promise<void> {
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión de empresa no iniciada.');
    const connectionId = Number(req.query.connection_id);
    if (!Number.isInteger(connectionId) || connectionId <= 0) {
      throw new ValidationError('Selecciona una cuenta publicitaria conectada.');
    }
    const credentials = await credencialesMeta(req.organizationId, connectionId);
    if (!credentials) throw new HttpError(503, 'La cuenta Meta seleccionada no está disponible.');
    res.json(await listMetaPages(credentials.accessToken));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function buscarUbicacionesMeta(req: Request, res: Response): Promise<void> {
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión de empresa no iniciada.');
    const connectionId = Number(req.query.connection_id);
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!Number.isInteger(connectionId) || connectionId <= 0 || query.length < 2 || query.length > 100) {
      throw new ValidationError('Selecciona una cuenta conectada e ingresa al menos dos caracteres de ubicación.');
    }
    const credentials = await credencialesMeta(req.organizationId, connectionId);
    if (!credentials) throw new HttpError(503, 'La cuenta Meta seleccionada no está disponible.');
    res.json(await searchMetaAdLocations(credentials.accessToken, query));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

export const { router: conexionRouter } = createCrudRouter({
  table: 'conexiones',
  primaryKey: 'conexion_id',
  request: conexionRequest,
  resource: conexionResource,
  entityName: 'Conexión',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByOwnerOrAdmin, forceEmpresa],
  disabled: ['create', 'update'],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
  extraRoutes: (router) => {
    router.post(
      '/meta/oauth/start',
      ...requireOrg,
      writeByOwnerOrAdmin,
      manageIntegrations,
      iniciarOAuthMeta,
    );
    router.post(
      '/meta/oauth/complete',
      ...requireOrg,
      writeByOwnerOrAdmin,
      manageIntegrations,
      completarOAuthMetaSdk,
    );
    router.get('/meta/oauth/callback', callbackOAuthMeta);
    router.post('/meta/data-deletion', callbackMetaDataDeletion);
    router.get(
      '/meta/pages',
      ...requireOrg,
      writeByMarketing,
      requirePermission('gestionar_campanas'),
      listarPaginasMeta,
    );
    router.get(
      '/meta/locations',
      ...requireOrg,
      writeByMarketing,
      requirePermission('gestionar_campanas'),
      buscarUbicacionesMeta,
    );
  },
});

const slugObjetivo = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, '_');

const objetivoIds = new Map<string, number>();

async function resolverObjetivo(value: unknown): Promise<number> {
  const slug = slugObjetivo(String(value));
  const cached = objetivoIds.get(slug);
  if (cached) return cached;

  const { data, error } = await supabase.from('objetivo_publicidad').select('objetivo_publicidad_id, nombre');
  if (error) throw new Error(error.message);
  const objetivo = (data ?? []).find((row) => slugObjetivo(row.nombre) === slug);
  if (!objetivo) throw new ValidationError('Objetivo de campaña inválido', [
    { field: 'objetivo', message: 'Selecciona un objetivo disponible.' },
  ]);
  objetivoIds.set(slug, objetivo.objetivo_publicidad_id);
  return objetivo.objetivo_publicidad_id;
}

const campaignFields = {
  property_id: 'propiedad_id',
  connection_id: 'conexion_id',
  estado: 'estado_flujo',
  presupuesto_maximo: 'presupuesto_diario',
  copy: 'copy_anuncio',
  duration_days: 'duracion_dias',
};

const rejectClientCampaignState: RequestHandler = (req, _res, next) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && ('estado' in body || 'estado_flujo' in body)) {
    next(new ValidationError('El estado de la campaña solo puede cambiar mediante las acciones del flujo.'));
    return;
  }
  next();
};

const requireEditableCampaign: RequestHandler = async (req, res, next) => {
  if (req.method === 'POST') {
    next();
    return;
  }
  try {
    const { data: campaign, error } = await supabase
      .from('campanias_publicitarias')
      .select('empresa_id, estado_flujo')
      .eq('campania_publicitaria_id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign || String(campaign.empresa_id) !== req.organizationId) {
      res.status(404).json({ message: 'Campaña no encontrada' });
      return;
    }
    if (req.method === 'DELETE') {
      if (!['local_draft', 'validated'].includes(campaign.estado_flujo)) {
        res.status(409).json({ message: 'No se pueden eliminar campañas en aprobación o publicación.' });
        return;
      }
      next();
      return;
    }
    if (!['local_draft', 'validated'].includes(campaign.estado_flujo)) {
      res.status(409).json({ message: 'La campaña ya está en aprobación o publicación y no se puede editar.' });
      return;
    }
    if (campaign.estado_flujo === 'validated') {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body) {
        res.status(400).json({ message: 'El cuerpo de la actualización no es válido.' });
        return;
      }
      body.estado_flujo = 'local_draft';
    }
    next();
  } catch (error) {
    next(error);
  }
};

async function campaignById(id: number, companyId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('campanias_publicitarias')
    .select('*, objetivo_publicidad(nombre)')
    .eq('campania_publicitaria_id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || String(data.empresa_id) !== companyId) throw new NotFoundError('Campaña');
  return data as Record<string, unknown>;
}

function assertCampaignReady(campaign: Record<string, unknown>): void {
  if (
    !campaign.nombre ||
    !campaign.propiedad_id ||
    !campaign.objetivo_publicidad_id ||
    !(Number(campaign.presupuesto_diario) > 0)
  ) {
    throw new ValidationError('Completa propiedad, nombre, objetivo y presupuesto antes de validar.');
  }
  if (!campaign.titulo || !campaign.copy_anuncio || String(campaign.copy_anuncio).trim().length < 10) {
    throw new ValidationError('Completa el título y el copy del anuncio antes de validar.');
  }
  if (!/^https:\/\/\S+$/i.test(String(campaign.creative_url ?? ''))) {
    throw new ValidationError('Añade la URL HTTPS pública del creativo aprobado.');
  }
  if (
    !/^\d{1,30}$/.test(String(campaign.meta_page_id ?? '')) ||
    !/^\d{1,30}$/.test(String(campaign.target_location_key ?? '')) ||
    !/^[A-Z]{2}$/.test(String(campaign.target_location_country_code ?? ''))
  ) {
    throw new ValidationError('Selecciona una Página de Facebook y una ciudad de Meta con jurisdicción confirmada.');
  }
  if (!/^https:\/\/\S+$/i.test(String(campaign.privacy_policy_url ?? ''))) {
    throw new ValidationError('La política de privacidad debe tener una URL pública HTTPS.');
  }
  if (!['image', 'video'].includes(String(campaign.media_type ?? ''))) {
    throw new ValidationError('Selecciona si el creativo aprobado es una imagen o un video.');
  }
  const start = Date.parse(String(campaign.fecha_inicio ?? ''));
  const end = Date.parse(String(campaign.fecha_fin ?? ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start) {
    throw new ValidationError('Indica un periodo futuro válido para la campaña.');
  }
}

async function assertOwnedActiveProperty(
  campaign: Record<string, unknown>,
  companyId: string,
): Promise<void> {
  const propertyId = Number(campaign.propiedad_id);
  if (!Number.isSafeInteger(propertyId) || propertyId <= 0) {
    throw new ValidationError('Selecciona una propiedad antes de continuar.');
  }
  const { data: property, error } = await supabase
    .from('propiedades')
    .select('empresa_id, estado')
    .eq('propiedad_id', propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!property || String(property.empresa_id) !== companyId) throw new NotFoundError('Propiedad');
  if (property.estado === 'inactivo') {
    throw new ValidationError('La propiedad no está activa; confirma su estado antes de continuar.');
  }
}

async function validarCampania(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Identificador inválido.');
    const campaign = await campaignById(id, req.organizationId as string);
    if (campaign.estado_flujo !== 'local_draft') {
      throw new HttpError(409, 'Solo se pueden validar campañas en borrador local.');
    }
    assertCampaignReady(campaign);
    await assertOwnedActiveProperty(campaign, req.organizationId as string);
    const { data, error } = await supabase
      .from('campanias_publicitarias')
      .update({ estado_flujo: 'validated' })
      .eq('campania_publicitaria_id', id)
      .eq('empresa_id', Number(req.organizationId))
      .eq('estado_flujo', 'local_draft')
      .select('*, objetivo_publicidad(nombre)')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpError(409, 'La campaña cambió de estado; vuelve a cargarla.');
    await logAudit('campanias_publicitarias', 'UPDATE', id, { accion: 'campaign_validated' }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });
    res.json(campaignResource.format(data));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function solicitarAprobacion(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Identificador inválido.');
    const campaign = await campaignById(id, req.organizationId as string);
    if (campaign.estado_flujo !== 'validated') {
      throw new HttpError(409, 'Valida la campaña antes de solicitar aprobación.');
    }
    assertCampaignReady(campaign);
    await assertOwnedActiveProperty(campaign, req.organizationId as string);
    const { data, error } = await supabase
      .from('campanias_publicitarias')
      .update({ estado_flujo: 'awaiting_approval' })
      .eq('campania_publicitaria_id', id)
      .eq('empresa_id', Number(req.organizationId))
      .eq('estado_flujo', 'validated')
      .select('*, objetivo_publicidad(nombre)')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpError(409, 'La campaña cambió de estado; vuelve a cargarla.');

    const { error: approvalError } = await supabase.from('campaign_approvals').insert({
      campania_publicitaria_id: id,
      empresa_id: Number(req.organizationId),
      accion: 'requested',
      actor_user_id: req.userId ?? null,
      snapshot: {
        nombre: campaign.nombre,
        objetivo_publicidad_id: campaign.objetivo_publicidad_id,
        presupuesto_diario: campaign.presupuesto_diario,
        moneda: campaign.moneda,
        titulo: campaign.titulo,
        copy_anuncio: campaign.copy_anuncio,
        creative_url: campaign.creative_url,
      },
    });
    if (approvalError) {
      await supabase
        .from('campanias_publicitarias')
        .update({ estado_flujo: 'validated' })
        .eq('campania_publicitaria_id', id)
        .eq('estado_flujo', 'awaiting_approval');
      throw new Error(approvalError.message);
    }
    await logAudit('campanias_publicitarias', 'UPDATE', id, { accion: 'approval_requested' }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });
    res.json(campaignResource.format(data));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function decidirAprobacion(req: Request, res: Response, decision: 'approved' | 'rejected'): Promise<void> {
  let approvalId: number | null = null;
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Identificador inválido.');
    const comment = typeof req.body?.comentario === 'string' ? req.body.comentario.trim() : '';
    if (comment.length > 1000) throw new ValidationError('El comentario no puede superar 1000 caracteres.');
    const campaign = await campaignById(id, req.organizationId as string);
    if (campaign.estado_flujo !== 'awaiting_approval') {
      throw new HttpError(409, 'Solo se pueden decidir campañas pendientes de aprobación.');
    }

    const { data: approval, error: insertError } = await supabase
      .from('campaign_approvals')
      .insert({
        campania_publicitaria_id: id,
        empresa_id: Number(req.organizationId),
        accion: decision,
        actor_user_id: req.userId ?? null,
        comentario: comment || null,
        snapshot: {
          nombre: campaign.nombre,
          objetivo_publicidad_id: campaign.objetivo_publicidad_id,
          presupuesto_diario: campaign.presupuesto_diario,
          moneda: campaign.moneda,
          titulo: campaign.titulo,
          copy_anuncio: campaign.copy_anuncio,
          creative_url: campaign.creative_url,
        },
      })
      .select('aprobacion_id')
      .single();
    if (insertError) throw new Error(insertError.message);
    approvalId = Number(approval.aprobacion_id);

    const { data, error } = await supabase
      .from('campanias_publicitarias')
      .update({ estado_flujo: decision === 'approved' ? 'approved' : 'rejected' })
      .eq('campania_publicitaria_id', id)
      .eq('empresa_id', Number(req.organizationId))
      .eq('estado_flujo', 'awaiting_approval')
      .select('*, objetivo_publicidad(nombre)')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      await supabase.from('campaign_approvals').delete().eq('aprobacion_id', approvalId);
      approvalId = null;
      throw new HttpError(409, 'La aprobación ya fue procesada por otro usuario.');
    }
    await logAudit('campanias_publicitarias', 'UPDATE', id, {
      accion: `campaign_${decision}`,
      aprobacion_id: approvalId,
      comentario: comment || undefined,
    }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });
    res.json(campaignResource.format(data));
  } catch (error) {
    if (approvalId !== null) {
      const { data: latest, error: stateError } = await supabase
        .from('campanias_publicitarias')
        .select('estado_flujo')
        .eq('campania_publicitaria_id', Number(req.params.id))
        .eq('empresa_id', Number(req.organizationId))
        .maybeSingle();
      if (!stateError && latest?.estado_flujo === 'awaiting_approval') {
        const { error: cleanupError } = await supabase
          .from('campaign_approvals')
          .delete()
          .eq('aprobacion_id', approvalId);
        if (cleanupError) console.error('[advertising] no se pudo limpiar una decisión fallida');
      }
    }
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function generarEstrategia(req: Request, res: Response): Promise<void> {
  try {
    const rawPropertyId = req.body?.property_id;
    const propertyId = Number(rawPropertyId);
    const objective = req.body?.objetivo;
    const budget = req.body?.presupuesto;
    const audience = req.body?.publico_objetivo;
    const validObjectives = ['visitas', 'trafico', 'mensajes', 'formularios', 'branding'];
    if ((!Number.isSafeInteger(rawPropertyId) && !(typeof rawPropertyId === 'string' && /^[1-9]\d*$/.test(rawPropertyId))) || !Number.isSafeInteger(propertyId) || propertyId <= 0 ||
      !validObjectives.includes(objective) || typeof budget !== 'number' || !Number.isFinite(budget) || budget < 1 || budget > 100000 ||
      typeof audience !== 'string' || audience.trim().length < 2 || audience.trim().length > 500) {
      throw new ValidationError('Selecciona una propiedad y un objetivo válidos.');
    }
    const { data, error } = await supabase
      .from('propiedades')
      .select('nombre, ubicacion, precio, disponibilidad, descripcion, estado')
      .eq('propiedad_id', propertyId)
      .eq('empresa_id', Number(req.organizationId))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError('Propiedad');
    if (data.estado === 'inactivo') throw new ValidationError('La estrategia requiere una propiedad activa.');
    const propiedad: PropiedadEstrategica = {
      nombre: String(data.nombre ?? '').trim(),
      ubicacion: data.ubicacion == null ? null : String(data.ubicacion).trim(),
      precio: data.precio == null ? null : Number(data.precio),
      disponibilidad: data.disponibilidad == null ? null : String(data.disponibilidad),
      descripcion: data.descripcion == null ? null : String(data.descripcion).trim(),
    };
    if (!propiedad.nombre || (propiedad.precio !== null && !Number.isFinite(propiedad.precio))) {
      throw new ValidationError('La ficha de propiedad no contiene datos válidos.');
    }
    const input = { propiedad, objetivo: objective as 'visitas' | 'trafico' | 'mensajes' | 'formularios' | 'branding' };
    const base = strategistService.build(input);
    const providerResult = await generarEstrategiaConOpenRouter(input, budget, audience.trim());
    const ai = providerResult.strategy;
    const estrategia = {
      ...base,
      ...ai,
      presupuesto: budget,
      publico_objetivo: audience.trim(),
      datos_confirmados: {
        nombre: propiedad.nombre,
        ...(propiedad.ubicacion ? { ubicacion: propiedad.ubicacion } : {}),
        ...(propiedad.precio !== null ? { precio: propiedad.precio } : {}),
        ...(propiedad.disponibilidad ? { disponibilidad: propiedad.disponibilidad } : {}),
        ...(propiedad.descripcion ? { descripcion: propiedad.descripcion } : {}),
      },
      datos_faltantes: [
        ...(!propiedad.ubicacion ? ['ubicacion'] : []),
        ...(propiedad.precio === null ? ['precio'] : []),
        ...(!propiedad.disponibilidad ? ['disponibilidad'] : []),
        ...(!propiedad.descripcion ? ['descripcion'] : []),
      ],
      generador_version: GENERATOR_VERSION,
    };
    console.info(JSON.stringify({ event: 'ai_strategy_provider', provider: providerResult.provider, model: providerResult.model, status: 'succeeded', duration_ms: providerResult.durationMs, estimated_cost_usd: providerResult.estimatedCostUsd }));
    const { data: registro, error: registroError } = await supabase.from('estrategias_comerciales').insert({
      propiedad_id: propertyId,
      empresa_id: Number(req.organizationId),
      usuario_id: req.localUsuarioId ?? null,
      auth_user_id: req.userId ?? null,
      objetivo: objective,
      presupuesto: budget,
      publico_objetivo: audience.trim(),
      generador_version: GENERATOR_VERSION,
      proveedor: providerResult.provider,
      modelo_proveedor: providerResult.model,
      estado_proveedor: 'succeeded',
      duracion_proveedor_ms: providerResult.durationMs,
      costo_estimado_usd: providerResult.estimatedCostUsd,
      resultado: estrategia,
    }).select('estrategia_id, creado_en').single();
    if (registroError) throw new Error('STRATEGY_AUDIT_WRITE_FAILED');
    await logAudit('estrategias_comerciales', 'CREATE', registro.estrategia_id, {
      propiedad_id: propertyId,
      generador_version: GENERATOR_VERSION,
    }, { authUserId: req.userId, usuarioId: req.localUsuarioId, empresaId: req.organizationId });
    res.json({ ...estrategia, estrategia_id: registro.estrategia_id, creado_en: registro.creado_en });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('OPENROUTER_')) {
      console.warn(JSON.stringify({ event: 'ai_strategy_provider', provider: 'openrouter', status: 'failed', error_code: error.message }));
      res.status(502).json({ message: 'No fue posible generar la estrategia ahora. Intenta nuevamente más tarde.' });
      return;
    }
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function consultarAnaliticaCampanas(req: Request, res: Response): Promise<void> {
  try {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const desde = typeof req.query.desde === 'string' ? req.query.desde : '';
    const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : '';
    const fuente = typeof req.query.fuente === 'string' ? req.query.fuente : 'meta';
    const campaignId = typeof req.query.campania_id === 'string' ? req.query.campania_id : '';
    const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    const fromDate = new Date(`${desde}T00:00:00Z`);
    const toDate = new Date(`${hasta}T00:00:00Z`);
    const days = (toDate.getTime() - fromDate.getTime()) / 86400000;
    if (!datePattern.test(desde) || !datePattern.test(hasta) || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) ||
      fromDate.toISOString().slice(0, 10) !== desde || toDate.toISOString().slice(0, 10) !== hasta ||
      days < 0 || days > 90 || fuente !== 'meta' || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || (campaignId && !/^[1-9]\d*$/.test(campaignId))) {
      throw new ValidationError('Parámetros inválidos. Usa desde/hasta YYYY-MM-DD (máximo 90 días), fuente=meta, campania_id opcional, limit 1-100 y offset >= 0.');
    }
    let query = supabase.from('campanias_publicitarias')
      .select('campania_publicitaria_id, nombre, meta_campaign_id, conexion_id', { count: 'exact' })
      .eq('empresa_id', Number(req.organizationId))
      .order('campania_publicitaria_id', { ascending: true })
      .range(offset, offset + limit - 1);
    if (campaignId) query = query.eq('campania_publicitaria_id', Number(campaignId));
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    const metricas = await Promise.all((data ?? []).map(async (row) => {
      const credentials = row.meta_campaign_id
        ? await credencialesMeta(req.organizationId as string, row.conexion_id == null ? null : Number(row.conexion_id))
        : null;
      return obtenerMetricasMeta({
        campaign_id: String(row.campania_publicitaria_id),
        campaign_name: row.nombre == null ? null : String(row.nombre),
        meta_campaign_id: row.meta_campaign_id == null ? null : String(row.meta_campaign_id),
      }, credentials, desde, hasta);
    }));
    res.json({
      items: metricas,
      pagination: { limit, offset, total: count ?? 0, has_more: offset + metricas.length < (count ?? 0) },
      formulas: { ctr: 'clics / impresiones * 100; null cuando impresiones es 0 o falta algún dato', cpl: 'gasto / leads; null cuando leads es 0 o falta algún dato' },
      datos: { fuente: 'Meta Marketing API Insights', actualizado_en: new Date().toISOString(), antiguedad: 'Meta puede revisar y actualizar las métricas; la API no garantiza tiempo real. El campo actualizado_en indica cuándo se consultó, no cuándo Meta originó cada evento.' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CAMPAIGN_ANALYTICS_PROVIDER_ERROR') {
      res.status(502).json({ message: 'Meta no pudo devolver las métricas solicitadas. Intenta más tarde.' });
      return;
    }
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

async function sincronizarEstadoMeta(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Identificador inválido.');
    const campaign = await campaignById(id, req.organizationId as string);
    if (!['published_paused', 'active'].includes(String(campaign.estado_flujo))) {
      throw new HttpError(409, 'Solo se puede sincronizar una campaña ya publicada en Meta.');
    }
    if (!campaign.meta_campaign_id) {
      throw new HttpError(409, 'La campaña no tiene un ID real de Meta para sincronizar.');
    }
    const credentials = await credencialesMeta(
      req.organizationId as string,
      campaign.conexion_id == null ? null : Number(campaign.conexion_id),
    );
    if (!credentials) throw new HttpError(503, 'Conecta Meta antes de sincronizar el estado.');

    const state = await metaService.syncCampaignDeliveryStatus({
      campaignId: String(campaign.meta_campaign_id),
      adsetId: campaign.meta_adset_id == null ? null : String(campaign.meta_adset_id),
      adId: campaign.meta_ad_id == null ? null : String(campaign.meta_ad_id),
      credentials,
    });
    const { data, error } = await supabase
      .from('campanias_publicitarias')
      .update({ estado_flujo: state })
      .eq('campania_publicitaria_id', id)
      .eq('empresa_id', Number(req.organizationId))
      .in('estado_flujo', ['published_paused', 'active'])
      .select('*, objetivo_publicidad(nombre)')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpError(409, 'La campaña cambió de estado; vuelve a cargarla.');
    await logAudit('campanias_publicitarias', 'UPDATE', id, {
      accion: 'meta_status_synchronized',
      estado_flujo: state,
    }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });
    res.json(campaignResource.format(data));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

// ── Campaigns: contrato inglés del frontend sobre campanias_publicitarias ──
export const { router: campaignRouter } = createCrudRouter({
  table: 'campanias_publicitarias',
  primaryKey: 'campania_publicitaria_id',
  joins: ['objetivo_publicidad(*)'],
  request: campaignRequest,
  resource: campaignResource,
  entityName: 'Campaña',
  middlewares: [...requireOrg, filterByEmpresa, translateQuery(campaignFields)],
  writeMiddlewares: [
    writeByMarketing,
    requirePermission('gestionar_campanas'),
    rejectClientCampaignState,
    translateBody(campaignFields),
    resolveField('objetivo', 'objetivo_publicidad_id', (value) => resolverObjetivo(value)),
    forceEmpresa,
    requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id'),
    requireOwnedRef('conexion_id', 'conexiones', 'conexion_id'),
    requireEditableCampaign,
    limitarPorPlan('campanias_meta'),
  ],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
  extraRoutes: (router) => {
    router.get('/reports/analytics', ...requireOrg, requirePermission('ver_analitica'), consultarAnaliticaCampanas);
    router.post(
      '/strategist',
      ...requireOrg,
      writeByMarketing,
      requirePermission('gestionar_campanas'),
      generarEstrategia,
    );
    router.post(
      '/:id/validate',
      ...requireOrg,
      writeByMarketing,
      requirePermission('gestionar_campanas'),
      validarCampania,
    );
    router.post(
      '/:id/request-approval',
      ...requireOrg,
      writeByMarketing,
      requirePermission('gestionar_campanas'),
      solicitarAprobacion,
    );
    router.post(
      '/:id/sync-status',
      ...requireOrg,
      writeByMarketing,
      requirePermission('gestionar_campanas'),
      sincronizarEstadoMeta,
    );
    router.post(
      '/:id/approve',
      ...requireOrg,
      writeByOwnerOrAdmin,
      (req, res) => void decidirAprobacion(req, res, 'approved'),
    );
    router.post(
      '/:id/reject',
      ...requireOrg,
      writeByOwnerOrAdmin,
      (req, res) => void decidirAprobacion(req, res, 'rejected'),
    );
  },
});

// ── Publicación en Meta ─────────────────────────────────────────────────────

/** Prefer the selected OAuth connection; retain the legacy config as a migration fallback. */
export async function credencialesMeta(
  empresaId: string,
  conexionId?: number | null,
): Promise<MetaCredentials | null> {
  let connectionQuery = supabase
    .from('conexiones')
    .select('conexion_id, cuenta_publicitaria_id, meta_currency, estado, access_token_enc, token_expira_en')
    .eq('empresa_id', Number(empresaId))
    .eq('estado', 'conectada');
  if (conexionId != null) connectionQuery = connectionQuery.eq('conexion_id', conexionId);
  const { data: connection, error: connectionError } = await connectionQuery
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionError) throw new Error(`No se pudo leer la conexión Meta: ${connectionError.message}`);
  if (connection) {
    if (!connection.access_token_enc) {
      throw new HttpError(503, 'La conexión seleccionada de Meta no tiene un token guardado.');
    }
    if (
      connection.token_expira_en &&
      new Date(connection.token_expira_en).getTime() <= Date.now()
    ) {
      throw new HttpError(503, 'La conexión seleccionada de Meta expiró. Vuelve a conectarla.');
    }
    return {
      adAccountId: connection.cuenta_publicitaria_id,
      accessToken: decryptMetaToken(connection.access_token_enc),
      currency: connection.meta_currency ?? undefined,
    };
  }
  if (conexionId != null) {
    throw new HttpError(503, 'La cuenta Meta seleccionada no está conectada a esta empresa.');
  }

  const integration = await getCompanyIntegrationConfig(empresaId, 'Meta Ads');
  if (!integration) return null;
  const entorno = integration.entorno.trim().toLowerCase();
  if (['sandbox', 'desarrollo', 'test'].includes(entorno)) return null;
  if (!['produccion', 'production', 'prod'].includes(entorno)) {
    throw new HttpError(503, 'El entorno de la conexión Meta Ads debe ser produccion o sandbox.');
  }
  if (!integration.api_id?.trim() || !integration.access_token?.trim()) {
    throw new HttpError(503, 'La conexión activa de Meta Ads no tiene configurados el ID de cuenta y el token.');
  }
  return {
    adAccountId: integration.api_id,
    accessToken: integration.access_token,
  };
}

/**
 * POST /:id/publicar — crea la campaña en Meta en estado PAUSED (nunca activa
 * gasto). Body opcional: `{ "validar_solo": true }` valida con Meta sin crear.
 */
async function publicarEnMeta(req: Request, res: Response): Promise<void> {
  let reservada = false;
  const id = Number(req.params.id);
  try {
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Identificador inválido');
    const idempotencyKey = req.get('Idempotency-Key') ?? '';
    if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(idempotencyKey)) {
      throw new ValidationError('Envía un Idempotency-Key UUID v4 para publicar la campaña.');
    }
    const validarSolo = req.body?.validar_solo === true;

    const { data: campania, error } = await supabase
      .from('campanias_publicitarias')
      .select('*, objetivo_publicidad(nombre)')
      .eq('campania_publicitaria_id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Una campaña de otra empresa es indistinguible de una inexistente.
    if (!campania || String(campania.empresa_id) !== req.organizationId) {
      throw new NotFoundError('Campaña publicitaria');
    }
    if (campania.meta_campaign_id) {
      if (campania.meta_idempotency_key !== idempotencyKey) {
        throw new HttpError(409, 'La campaña ya se publicó con otra clave de idempotencia.');
      }
      res.json({
        message: 'Resultado de publicación recuperado',
        campania_publicitaria_id: id,
        meta_estado: 'published_paused',
        meta_campaign_id: campania.meta_campaign_id,
        meta_adset_id: campania.meta_adset_id ?? null,
        meta_adcreative_id: campania.meta_adcreative_id ?? null,
        meta_ad_id: campania.meta_ad_id ?? null,
        meta_lead_form_id: campania.meta_lead_form_id ?? null,
        simulado: String(campania.meta_campaign_id).startsWith('META-SIM-'),
        validado_solo: false,
        replayed: true,
      });
      return;
    }
    if (campania.estado === 'inactivo') throw new ValidationError('La campaña está inactiva');
    if (campania.estado_flujo !== 'approved') {
      throw new HttpError(409, 'La campaña debe tener aprobación explícita antes de enviarse a Meta.');
    }
    assertCampaignReady(campania);
    await assertOwnedActiveProperty(campania, req.organizationId as string);
    if (campania.meta_estado) {
      throw new HttpError(409, 'La campaña ya se está publicando en Meta.');
    }
    if (campania.meta_idempotency_key && campania.meta_idempotency_key !== idempotencyKey) {
      throw new HttpError(409, 'Esta campaña ya reservó otra clave de idempotencia; reintenta con la misma clave.');
    }
    if (!(Number(campania.presupuesto_diario) > 0)) {
      throw new ValidationError('El presupuesto diario debe ser mayor a cero');
    }

    const credentials = await credencialesMeta(
      req.organizationId as string,
      campania.conexion_id == null ? null : Number(campania.conexion_id),
    );
    const simulate = credentials === null;
    const input = {
      campaniaId: id,
      nombre: String(campania.nombre),
      objetivo: String(campania.objetivo_publicidad?.nombre ?? ''),
      credentials: credentials ?? { adAccountId: '', accessToken: '' },
      simulate,
      ...(campania.meta_page_id ||
      campania.target_location_key ||
      campania.privacy_policy_url ||
      campania.creative_url
        ? {
            leadAd: {
              pageId: String(campania.meta_page_id ?? ''),
              ...(campania.meta_instagram_id
                ? { instagramActorId: String(campania.meta_instagram_id) }
                : {}),
              locationKey: String(campania.target_location_key ?? ''),
              locationCountryCode: String(campania.target_location_country_code ?? ''),
              privacyPolicyUrl: String(campania.privacy_policy_url ?? ''),
              mediaUrl: String(campania.creative_url ?? ''),
              mediaType: campania.media_type as 'image' | 'video',
              dailyBudget: Number(campania.presupuesto_diario),
              currency: String(campania.moneda ?? ''),
              startAt: String(campania.fecha_inicio ?? ''),
              endAt: String(campania.fecha_fin ?? ''),
              title: String(campania.titulo ?? ''),
              copy: String(campania.copy_anuncio ?? ''),
            },
          }
        : {}),
    };

    if (input.leadAd && (
      !input.leadAd.pageId ||
      !input.leadAd.locationKey ||
      !input.leadAd.privacyPolicyUrl ||
      !input.leadAd.mediaUrl ||
      !['image', 'video'].includes(input.leadAd.mediaType) ||
      !input.leadAd.title ||
      !input.leadAd.copy ||
      !campania.fecha_inicio ||
      !campania.fecha_fin
    )) {
      throw new ValidationError('El borrador no tiene todos los datos requeridos para crear el anuncio de formulario.');
    }
    if (input.leadAd && credentials && credentials.currency !== campania.moneda) {
      throw new ValidationError(
        'La moneda del borrador no coincide con la cuenta publicitaria. Actualiza el borrador o vuelve a conectar Meta.',
      );
    }
    if (input.leadAd && credentials) {
      await validateMetaAdResources(credentials.accessToken, {
        pageId: input.leadAd.pageId,
        instagramId: input.leadAd.instagramActorId,
        locationKey: input.leadAd.locationKey,
        locationName: String(campania.target_location_name ?? ''),
        countryCode: input.leadAd.locationCountryCode,
      });
    }

    if (validarSolo) {
      const r = await metaService.publishCampaniaPaused({ ...input, validateOnly: true });
      res.json({
        message: input.leadAd
          ? 'Validación local correcta: no se creó nada en Meta'
          : 'Validación correcta: no se creó nada en Meta',
        ...r,
      });
      return;
    }

    // Reserva atómica: solo UNA petición concurrente pasa de "sin publicar" a "publicando".
    const { data: reserva, error: errReserva } = await supabase
      .from('campanias_publicitarias')
      .update({ meta_estado: 'publicando', meta_idempotency_key: idempotencyKey })
      .eq('campania_publicitaria_id', id)
      .eq('empresa_id', Number(req.organizationId))
      .eq('estado_flujo', 'approved')
      .is('meta_campaign_id', null)
      .is('meta_estado', null)
      .or(`meta_idempotency_key.is.null,meta_idempotency_key.eq.${idempotencyKey}`)
      .select('campania_publicitaria_id');
    if (errReserva) throw new Error(errReserva.message);
    if (!reserva?.length) {
      const { data: latest, error: latestError } = await supabase
        .from('campanias_publicitarias')
        .select('meta_estado, meta_campaign_id, meta_idempotency_key')
        .eq('campania_publicitaria_id', id)
        .eq('empresa_id', Number(req.organizationId))
        .maybeSingle();
      if (latestError) throw new Error(latestError.message);
      if (latest?.meta_campaign_id && latest.meta_idempotency_key === idempotencyKey) {
        res.json({
          message: 'Resultado de publicación recuperado',
          campania_publicitaria_id: id,
          meta_estado: 'published_paused',
          meta_campaign_id: latest.meta_campaign_id,
          simulado: String(latest.meta_campaign_id).startsWith('META-SIM-'),
          validado_solo: false,
          replayed: true,
        });
        return;
      }
      throw new HttpError(409, 'La publicación está en curso o la campaña cambió de estado.');
    }
    reservada = true;

    const r = await metaService.publishCampaniaPaused(input);

    const { error: errGuardar } = await supabase
      .from('campanias_publicitarias')
      .update({
        meta_campaign_id: r.meta_campaign_id,
        meta_adset_id: r.meta_adset_id ?? null,
        meta_adcreative_id: r.meta_adcreative_id ?? null,
        meta_ad_id: r.meta_ad_id ?? null,
        meta_lead_form_id: r.meta_lead_form_id ?? null,
        meta_estado: 'published_paused',
        estado_flujo: 'published_paused',
        publicada_en: new Date().toISOString(),
      })
      .eq('campania_publicitaria_id', id);
    if (errGuardar) {
      // La campaña YA existe en Meta (pausada): no se libera la reserva para no duplicarla.
      reservada = false;
      console.error('[meta] campaña creada en Meta pero no se pudo guardar su ID', id, r.meta_campaign_id);
      throw new Error(errGuardar.message);
    }
    reservada = false;

    await logAudit('campanias_publicitarias', 'UPDATE', id, {
      accion: input.leadAd ? 'crear_anuncio_meta_pausado' : 'publicar_meta',
      meta_campaign_id: r.meta_campaign_id,
      meta_adset_id: r.meta_adset_id,
      meta_ad_id: r.meta_ad_id,
      simulado: r.simulado,
    }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });

    res.status(201).json({
      message: r.simulado
        ? 'Anuncio creado en modo SIMULADO (pausado)'
        : input.leadAd
          ? 'Campaña, conjunto y anuncio creados en Meta en estado PAUSADO'
          : 'Campaña creada en Meta en estado PAUSADO',
      campania_publicitaria_id: id,
      meta_estado: 'published_paused',
      ...r,
      replayed: false,
    });
  } catch (error) {
    if (reservada) {
      // Meta no creó nada: libera la reserva para poder reintentar.
      const { error: releaseError } = await supabase
        .from('campanias_publicitarias')
        .update({ meta_estado: null })
        .eq('campania_publicitaria_id', id)
        .eq('meta_idempotency_key', req.get('Idempotency-Key') ?? '')
        .is('meta_campaign_id', null);
      if (releaseError) console.error('[meta] no se pudo liberar la reserva de publicación', id);
    }
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

// ── Campañas publicitarias ──────────────────────────────────────────────────
export const { router: campaniaPublicitariaRouter } = createCrudRouter({
  table: 'campanias_publicitarias',
  primaryKey: 'campania_publicitaria_id',
  joins: ['propiedades(*, empresas(*), tipos_propiedades(*))', 'objetivo_publicidad(*)'],
  request: campaniaPublicitariaRequest,
  resource: campaniaPublicitariaResource,
  entityName: 'Campaña publicitaria',
  middlewares: [...requireOrg],
  writeMiddlewares: [
    writeByMarketing,
    requireEditableCampaign,
    requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id'),
    limitarPorPlan('campanias_meta'),
  ],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // Sin columna de empresa: el dueño es el de su propiedad.
  tenantVia: { fk: 'propiedad_id', table: 'propiedades', pk: 'propiedad_id' },
  extraRoutes: (router) => {
    router.post('/:id/publicar', ...requireOrg, writeByMarketing, requirePermission('gestionar_campanas'), publicarEnMeta);
  },
});
