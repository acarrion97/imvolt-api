// controllers/advertising.controller.ts
// CRUD del módulo Publicidad (IMVOLT Ads): objetivos y campañas publicitarias.

import { Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import supabase from '../config/supabaseClient';
import { createCrudRouter } from '../core/crud.factory';
import { errorResponse, HttpError, NotFoundError, ValidationError } from '../core/errors';
import { config } from '../config/global';
import { logAudit } from '../services/audit.service';
import { metaService, MetaCredentials } from '../services/meta.service';
import { decryptMetaToken, encryptMetaToken } from '../services/meta-token.crypto';
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

interface MetaOAuthState {
  empresaId: string;
  issuedAt: number;
  nonce: string;
}

function firmarEstado(payload: string): string {
  return createHmac('sha256', config.meta.appSecret).update(payload).digest('base64url');
}

function crearEstado(empresaId: string): string {
  const payload = Buffer.from(JSON.stringify({
    empresaId,
    issuedAt: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  } satisfies MetaOAuthState)).toString('base64url');
  return `${payload}.${firmarEstado(payload)}`;
}

function verificarEstado(state: string): MetaOAuthState {
  const [payload, signature, ...extra] = state.split('.');
  if (!payload || !signature || extra.length > 0) throw new ValidationError('Estado OAuth inválido');
  const expected = Buffer.from(firmarEstado(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new ValidationError('Estado OAuth inválido');
  }
  let value: MetaOAuthState;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MetaOAuthState;
  } catch {
    throw new ValidationError('Estado OAuth inválido');
  }
  if (
    !value.empresaId ||
    !Number.isFinite(value.issuedAt) ||
    !/^[a-f0-9]{32}$/i.test(value.nonce) ||
    Date.now() - value.issuedAt > 10 * 60 * 1000 ||
    value.issuedAt > Date.now() + 30_000
  ) {
    throw new ValidationError('La solicitud OAuth expiró; inicia la conexión nuevamente');
  }
  return value;
}

const textoQuery = (value: unknown): string => typeof value === 'string' ? value : '';
const frontendMetaUrl = (result: 'connected' | 'error' | 'cancelled'): string => {
  const base = config.allowedOrigin[0];
  return `${base}/configuracion?meta=${result}`;
};

async function metaJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.error) {
    const metaError = result.error as { message?: string } | undefined;
    console.error('[meta-oauth] Meta API rechazó una solicitud', response.status);
    throw new HttpError(502, metaError?.message ?? 'Meta rechazó la solicitud OAuth');
  }
  return result;
}

async function iniciarOAuthMeta(req: Request, res: Response): Promise<void> {
  if (!config.meta.appId || !config.meta.appSecret || !config.meta.oauthRedirectUri) {
    throw new HttpError(503, 'Configura META_APP_ID, META_APP_SECRET y META_OAUTH_REDIRECT_URI en la API');
  }
  if (!/^[a-f0-9]{64}$/i.test(config.meta.tokenEncryptionKey)) {
    throw new HttpError(503, 'Configura META_TOKEN_ENCRYPTION_KEY antes de iniciar OAuth');
  }
  const state = crearEstado(req.organizationId as string);
  const url = new URL(`https://www.facebook.com/${config.meta.apiVersion}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: config.meta.oauthRedirectUri,
    response_type: 'code',
    scope: 'ads_management,ads_read,business_management',
    state,
  }).toString();
  res.json({ authorization_url: url.toString() });
}

async function callbackOAuthMeta(req: Request, res: Response): Promise<void> {
  const stateValue = textoQuery(req.query.state);
  try {
    const state = verificarEstado(stateValue);
    if (textoQuery(req.query.error)) {
      res.redirect(frontendMetaUrl('cancelled'));
      return;
    }
    const code = textoQuery(req.query.code);
    if (!code) throw new ValidationError('Meta no devolvió un código de autorización');
    if (!config.meta.appId || !config.meta.appSecret || !config.meta.oauthRedirectUri) {
      throw new HttpError(503, 'La integración OAuth de Meta no está configurada');
    }

    const tokenUrl = new URL(`https://graph.facebook.com/${config.meta.apiVersion}/oauth/access_token`);
    tokenUrl.search = new URLSearchParams({
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: config.meta.oauthRedirectUri,
      code,
    }).toString();
    const shortToken = await metaJson(tokenUrl);
    const shortAccessToken = String(shortToken.access_token ?? '');
    if (!shortAccessToken) throw new HttpError(502, 'Meta no devolvió un token de acceso');

    const longTokenUrl = new URL(`https://graph.facebook.com/${config.meta.apiVersion}/oauth/access_token`);
    longTokenUrl.search = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      fb_exchange_token: shortAccessToken,
    }).toString();
    const longToken = await metaJson(longTokenUrl);
    const accessToken = String(longToken.access_token ?? '');
    if (!accessToken) throw new HttpError(502, 'Meta no devolvió un token de larga duración');

    const permissionsUrl = new URL(`https://graph.facebook.com/${config.meta.apiVersion}/me/permissions`);
    permissionsUrl.search = new URLSearchParams({ access_token: accessToken }).toString();
    const permissionsResult = await metaJson(permissionsUrl);
    const grantedPermissions = ((permissionsResult.data ?? []) as Array<{ permission?: string; status?: string }>)
      .filter((permission) => permission.status === 'granted')
      .map((permission) => permission.permission)
      .filter((permission): permission is string => Boolean(permission));
    if (!grantedPermissions.includes('ads_management')) {
      throw new ValidationError('La autorización de Meta no concedió el permiso para administrar anuncios');
    }

    const accountsUrl = new URL(`https://graph.facebook.com/${config.meta.apiVersion}/me/adaccounts`);
    accountsUrl.search = new URLSearchParams({
      fields: 'id,name,account_status',
      limit: '100',
      access_token: accessToken,
    }).toString();
    const accountsResult = await metaJson(accountsUrl);
    const accounts = (accountsResult.data ?? []) as Array<{ id?: string; name?: string; account_status?: number }>;
    const activeAccounts = accounts.filter((account) => account.id && account.account_status === 1);
    if (!activeAccounts.length) {
      throw new ValidationError('No hay cuentas publicitarias activas disponibles en esta cuenta de Meta');
    }

    const expiresIn = Number(longToken.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;
    const encryptedToken = encryptMetaToken(accessToken);
    const { error } = await supabase.from('conexiones').upsert(
      activeAccounts.map((account) => ({
        empresa_id: Number(state.empresaId),
        cuenta_publicitaria_id: account.id as string,
        nombre_cuenta: account.name?.slice(0, 120) || account.id as string,
        estado: 'conectada',
        permisos: { granted: grantedPermissions },
        access_token_enc: encryptedToken,
        token_expira_en: expiresAt,
      })),
      { onConflict: 'empresa_id,cuenta_publicitaria_id' },
    );
    if (error) throw new Error(error.message);
    res.redirect(frontendMetaUrl('connected'));
  } catch (error) {
    const { status } = errorResponse(error);
    console.error('[meta-oauth] No se pudo completar OAuth', status);
    res.redirect(frontendMetaUrl('error'));
  }
}

// ── Conexiones de cuentas publicitarias ────────────────────────────────────
export const { router: conexionRouter } = createCrudRouter({
  table: 'conexiones',
  primaryKey: 'conexion_id',
  request: conexionRequest,
  resource: conexionResource,
  entityName: 'Conexión',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByOwnerOrAdmin, manageIntegrations, forceEmpresa],
  disabled: ['create', 'update'],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
  extraRoutes: (router) => {
    router.get('/meta/oauth/start', ...requireOrg, manageIntegrations, (req, res, next) => {
      iniciarOAuthMeta(req, res).catch(next);
    });
    router.get('/meta/oauth/callback', (req, res) => {
      callbackOAuthMeta(req, res).catch((error) => {
        console.error('[meta-oauth] Callback falló inesperadamente');
        res.redirect(frontendMetaUrl('error'));
      });
    });
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

/** Token OAuth cifrado asociado a la cuenta publicitaria elegida en la campaña. */
async function credencialesMeta(empresaId: string, conexionId: number | null): Promise<MetaCredentials | null> {
  if (!conexionId) return null;
  const { data, error } = await supabase
    .from('conexiones')
    .select('cuenta_publicitaria_id, access_token_enc, estado, token_expira_en')
    .eq('conexion_id', conexionId)
    .eq('empresa_id', empresaId)
    .eq('estado', 'conectada')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.access_token_enc) return null;
  if (data.token_expira_en && new Date(data.token_expira_en).getTime() <= Date.now()) return null;
  return {
    adAccountId: String(data.cuenta_publicitaria_id),
    accessToken: decryptMetaToken(String(data.access_token_enc)),
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
    if (!credentials) {
      throw new ValidationError('Tu empresa no tiene una integración de Meta Ads activa y completa', [
        { field: 'integracion', message: 'Conecta Meta por OAuth y selecciona una cuenta publicitaria activa en esta campaña' },
      ]);
    }
    const input = {
      campaniaId: id,
      objetivo: String(campania.objetivo_publicidad?.nombre ?? ''),
      credentials,
    };

    if (validarSolo) {
      const r = await metaService.publishCampaniaPaused({ ...input, validateOnly: true });
      res.json({ message: 'Validación correcta: no se creó nada en Meta', ...r });
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

    await logAudit('campanias_publicitarias', 'UPDATE', id, { accion: 'publicar_meta', meta_campaign_id: r.meta_campaign_id, simulado: r.simulado }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });

    res.status(201).json({
      message: r.simulado ? 'Campaña publicada en modo SIMULADO (pausada)' : 'Campaña creada en Meta en estado PAUSADO',
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
