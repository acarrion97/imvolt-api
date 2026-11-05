// controllers/advertising.controller.ts
// CRUD del módulo Publicidad (IMVOLT Ads): objetivos y campañas publicitarias.

import { Request, Response } from 'express';
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
} from '../services/meta-oauth.service';
import { metaService, MetaCredentials } from '../services/meta.service';
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
};

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
    translateBody(campaignFields),
    resolveField('objetivo', 'objetivo_publicidad_id', (value) => resolverObjetivo(value)),
    forceEmpresa,
    requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id'),
    requireOwnedRef('conexion_id', 'conexiones', 'conexion_id'),
  ],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});

// ── Publicación en Meta ─────────────────────────────────────────────────────

/** Prefer the selected OAuth connection; retain the legacy config as a migration fallback. */
async function credencialesMeta(
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
    if (campania.estado === 'inactivo') throw new ValidationError('La campaña está inactiva');
    if (campania.meta_campaign_id || campania.meta_estado) {
      throw new HttpError(409, 'La campaña ya fue publicada (o se está publicando) en Meta');
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
      .update({ meta_estado: 'publicando' })
      .eq('campania_publicitaria_id', id)
      .is('meta_campaign_id', null)
      .is('meta_estado', null)
      .select('campania_publicitaria_id');
    if (errReserva) throw new Error(errReserva.message);
    if (!reserva?.length) throw new HttpError(409, 'La campaña ya se está publicando en Meta');
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
    });
  } catch (error) {
    if (reservada) {
      // Meta no creó nada: libera la reserva para poder reintentar.
      await supabase.from('campanias_publicitarias').update({ meta_estado: null }).eq('campania_publicitaria_id', id).is('meta_campaign_id', null);
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
  writeMiddlewares: [writeByMarketing, requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id')],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // Sin columna de empresa: el dueño es el de su propiedad.
  tenantVia: { fk: 'propiedad_id', table: 'propiedades', pk: 'propiedad_id' },
  extraRoutes: (router) => {
    router.post('/:id/publicar', ...requireOrg, writeByMarketing, requirePermission('gestionar_campanas'), publicarEnMeta);
  },
});
