import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import axios from 'axios';
import supabase from '../config/supabaseClient';
import { config } from '../config/global';
import { HttpError, ValidationError } from '../core/errors';

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_AD_ACCOUNT_PAGES = 100;

interface MetaTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
}

interface MetaAdAccountsResponse {
  data: MetaAdAccount[];
  paging?: { cursors?: { after?: string } };
}

export interface MetaPage {
  id: string;
  name: string;
  instagram_business_account?: { id: string; username?: string };
}

export interface MetaAdLocation {
  key: string;
  name: string;
  region?: string;
  country_name?: string;
  country_code?: string;
}

interface MetaDebugTokenResponse {
  data: {
    app_id: string;
    is_valid: boolean;
    user_id?: string;
    scopes?: string[];
    granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
  };
}

interface MetaGraphErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

const REQUIRED_AD_SCOPES = ['ads_read', 'ads_management'] as const;

function metaErrorDetails(error: unknown, endpoint: string): Record<string, unknown> {
  if (!axios.isAxiosError<MetaGraphErrorResponse>(error)) return { endpoint };
  const meta = error.response?.data?.error;
  return {
    endpoint,
    ...(error.response?.status ? { status: error.response.status } : {}),
    ...(meta?.message ? { message: meta.message } : {}),
    ...(meta?.type ? { type: meta.type } : {}),
    ...(meta?.code !== undefined ? { code: meta.code } : {}),
    ...(meta?.error_subcode !== undefined ? { error_subcode: meta.error_subcode } : {}),
    ...(meta?.fbtrace_id ? { fbtrace_id: meta.fbtrace_id } : {}),
  };
}

async function validateMetaAccessToken(
  accessToken: string,
  expectedMetaUserId?: string,
): Promise<MetaDebugTokenResponse['data']> {
  const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
  let debug: MetaDebugTokenResponse['data'];
  try {
    const { data } = await axios.get<MetaDebugTokenResponse>(`${graphUrl}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: `${config.metaOAuth.appId}|${config.metaOAuth.appSecret}`,
      },
      timeout: 15000,
    });
    debug = data.data;
  } catch (error) {
    throw new HttpError(
      502,
      'Meta no pudo validar el token de acceso. Revisa la respuesta de diagnóstico.',
      metaErrorDetails(error, '/debug_token'),
    );
  }

  if (!debug?.is_valid || debug.app_id !== config.metaOAuth.appId || !debug.user_id) {
    throw new HttpError(401, 'Meta devolvió un token inválido o perteneciente a otra app.', {
      endpoint: '/debug_token',
      valid: Boolean(debug?.is_valid),
      app_matches: debug?.app_id === config.metaOAuth.appId,
    });
  }
  if (expectedMetaUserId && debug.user_id !== expectedMetaUserId) {
    throw new HttpError(401, 'El token de Meta no coincide con la cuenta autorizada.', {
      endpoint: '/debug_token',
    });
  }

  const grantedScopes = new Set(debug.scopes ?? []);
  const missingScopes = REQUIRED_AD_SCOPES.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length && !config.metaOAuth.allowLimitedAccess) {
    throw new HttpError(
      403,
      'Meta no concedió los permisos publicitarios necesarios. Revisa la configuración de Facebook Login for Business y el acceso de la app a esos permisos.',
      {
        endpoint: '/debug_token',
        missing_scopes: missingScopes,
        granted_scopes: debug.scopes ?? [],
        granular_scopes: debug.granular_scopes ?? [],
      },
    );
  }
  return debug;
}

function assertOAuthConfig(): void {
  const { appId, appSecret, tokenEncryptionKey, frontendUrl } = config.metaOAuth;
  if (!appId || !appSecret || !tokenEncryptionKey || !frontendUrl) {
    throw new HttpError(503, 'La conexión OAuth de Meta no está configurada en el servidor.');
  }
}

function encryptionKey(): Buffer {
  assertOAuthConfig();
  return Buffer.from(config.metaOAuth.tokenEncryptionKey, 'hex');
}

export async function createMetaOAuthState(
  empresaId: string,
): Promise<{ state: string; expires_at: string }> {
  assertOAuthConfig();
  const state = randomBytes(32).toString('hex');
  const stateHash = createHash('sha256').update(state).digest('hex');
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();

  const { error } = await supabase
    .from('meta_oauth_states')
    .insert({
      state_hash: stateHash,
      empresa_id: Number(empresaId),
      expira_en: expiresAt,
    });
  if (error) throw new HttpError(503, 'No se pudo iniciar de forma segura la conexión con Meta.');
  return { state, expires_at: expiresAt };
}

/**
 * Persists only an authenticated, long-lived Meta token. The raw token never
 * leaves this service and is encrypted before it reaches the database.
 */
export function encryptMetaToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptMetaToken(encrypted: string): string {
  const [version, ivText, tagText, ciphertextText, ...extra] = encrypted.split(':');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || extra.length) {
    throw new HttpError(503, 'El token guardado de Meta no tiene un formato válido.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new HttpError(503, 'No se pudo descifrar el token guardado de Meta.');
  }
}

export async function consumeMetaOAuthState(state: string): Promise<{ empresaId: number }> {
  const stateHash = createHash('sha256').update(state).digest('hex');
  const { data, error } = await supabase
    .from('meta_oauth_states')
    .update({ usado_en: new Date().toISOString() })
    .eq('state_hash', stateHash)
    .is('usado_en', null)
    .gt('expira_en', new Date().toISOString())
    .select('empresa_id')
    .maybeSingle();

  if (error) throw new HttpError(503, 'No se pudo validar el inicio de sesión con Meta.');
  if (!data) throw new HttpError(400, 'La autorización de Meta expiró o ya fue utilizada.');
  return { empresaId: Number(data.empresa_id) };
}

export async function exchangeMetaCode(code: string, state: string): Promise<{
  empresaId: number;
  metaUserId: string;
  accounts: MetaAdAccount[];
  encryptedToken: string;
  expiresAt: string | null;
  limitedAccess: boolean;
  grantedScopes: string[];
  missingAdScopes: string[];
}> {
  assertOAuthConfig();
  if (!config.metaOAuth.callbackUrl) {
    throw new HttpError(503, 'El callback OAuth del servidor no está configurado.');
  }

  const oauthState = await consumeMetaOAuthState(state);

  const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
  let shortLivedToken: string;
  try {
    const tokenResponse = await axios.get<MetaTokenResponse>(`${graphUrl}/oauth/access_token`, {
      params: {
        client_id: config.metaOAuth.appId,
        client_secret: config.metaOAuth.appSecret,
        redirect_uri: config.metaOAuth.callbackUrl,
        code,
      },
      timeout: 15000,
    });
    shortLivedToken = tokenResponse.data.access_token;
    if (!shortLivedToken) throw new Error('Missing access token');
  } catch {
    throw new HttpError(502, 'Meta no pudo completar la autorización. Inicia el proceso de nuevo.');
  }

  return persistMetaToken(oauthState.empresaId, shortLivedToken);
}

export async function exchangeMetaSdkToken(
  accessToken: string,
  state: string,
  expectedEmpresaId: string,
): Promise<{
  empresaId: number;
  metaUserId: string;
  accounts: MetaAdAccount[];
  encryptedToken: string;
  expiresAt: string | null;
  limitedAccess: boolean;
  grantedScopes: string[];
  missingAdScopes: string[];
}> {
  assertOAuthConfig();
  const oauthState = await consumeMetaOAuthState(state);
  if (String(oauthState.empresaId) !== expectedEmpresaId) {
    throw new HttpError(403, 'La autorización de Meta pertenece a otra empresa.');
  }

  const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
  let debug: MetaDebugTokenResponse['data'];
  try {
    const { data } = await axios.get<MetaDebugTokenResponse>(`${graphUrl}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: `${config.metaOAuth.appId}|${config.metaOAuth.appSecret}`,
      },
      timeout: 15000,
    });
    debug = data.data;
  } catch {
    throw new HttpError(502, 'Meta no pudo validar la autorización. Inicia el proceso de nuevo.');
  }

  if (!debug?.is_valid || debug.app_id !== config.metaOAuth.appId || !debug.user_id) {
    throw new HttpError(401, 'Meta devolvió una autorización inválida para esta aplicación.');
  }
  const scopes = new Set(debug.scopes ?? []);
  const missingAdScopes = REQUIRED_AD_SCOPES.filter((scope) => !scopes.has(scope));
  if (missingAdScopes.length && !config.metaOAuth.allowLimitedAccess) {
    throw new HttpError(
      403,
      'La autorización necesita permisos publicitarios, pages_show_list, leads_retrieval y pages_manage_metadata. Actualiza Facebook Login for Business y vuelve a conectar Meta.',
    );
  }

  return persistMetaToken(oauthState.empresaId, accessToken, debug.user_id);
}

export async function listMetaPages(accessToken: string): Promise<MetaPage[]> {
  const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
  try {
    const { data } = await axios.get<{ data: MetaPage[] }>(`${graphUrl}/me/accounts`, {
      params: {
        fields: 'id,name,instagram_business_account{id,username}',
        limit: 100,
        access_token: accessToken,
      },
      timeout: 15000,
    });
    return (data.data ?? []).filter((page) => page.id && page.name);
  } catch {
    throw new HttpError(
      502,
      'No se pudieron leer las páginas de Facebook. Verifica que la autorización incluya pages_show_list.',
    );
  }
}

export async function searchMetaAdLocations(
  accessToken: string,
  query: string,
): Promise<MetaAdLocation[]> {
  const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
  try {
    const { data } = await axios.get<{ data: MetaAdLocation[] }>(`${graphUrl}/search`, {
      params: {
        type: 'adgeolocation',
        q: query,
        location_types: JSON.stringify(['city']),
        fields: 'key,name,region,country_name,country_code',
        limit: 20,
        access_token: accessToken,
      },
      timeout: 15000,
    });
    return (data.data ?? []).filter((location) => location.key && location.name);
  } catch {
    throw new HttpError(502, 'Meta no pudo buscar ubicaciones para la segmentación inmobiliaria.');
  }
}

export async function validateMetaAdResources(
  accessToken: string,
  input: {
    pageId: string;
    instagramId?: string;
    locationKey: string;
    locationName: string;
    countryCode: string;
  },
): Promise<void> {
  const [pages, locations] = await Promise.all([
    listMetaPages(accessToken),
    searchMetaAdLocations(accessToken, input.locationName),
  ]);
  const page = pages.find((candidate) => candidate.id === input.pageId);
  if (!page) throw new ValidationError('La Página de Facebook seleccionada ya no está administrada por esta conexión.');
  if (
    input.instagramId &&
    page.instagram_business_account?.id !== input.instagramId
  ) {
    throw new ValidationError('La cuenta de Instagram no pertenece a la Página de Facebook seleccionada.');
  }
  const location = locations.find(
    (candidate) =>
      candidate.key === input.locationKey &&
      candidate.country_code?.toUpperCase() === input.countryCode.toUpperCase(),
  );
  if (!location) {
    throw new ValidationError('La ciudad seleccionada no coincide con la jurisdicción devuelta por Meta.');
  }
}

async function persistMetaToken(
  empresaId: number,
  shortLivedToken: string,
  expectedMetaUserId?: string,
): Promise<{
  empresaId: number;
  metaUserId: string;
  accounts: MetaAdAccount[];
  encryptedToken: string;
  expiresAt: string | null;
  limitedAccess: boolean;
  grantedScopes: string[];
  missingAdScopes: string[];
}> {
  const graphUrl = `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
  let accessToken: string;
  let expiresIn: number | undefined;
  try {
    const longLivedResponse = await axios.get<MetaTokenResponse>(`${graphUrl}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.metaOAuth.appId,
        client_secret: config.metaOAuth.appSecret,
        fb_exchange_token: shortLivedToken,
      },
      timeout: 15000,
    });
    accessToken = longLivedResponse.data.access_token;
    expiresIn = longLivedResponse.data.expires_in;
    if (!accessToken) throw new Error('Missing access token');
  } catch {
    throw new HttpError(502, 'Meta no pudo emitir una autorización de larga duración. Intenta de nuevo.');
  }

  // Validate the final token (not the temporary OAuth code/token) before the
  // ad-account edge. This makes missing grants explicit for both OAuth flows.
  const debug = await validateMetaAccessToken(accessToken, expectedMetaUserId);
  const grantedScopes = debug.scopes ?? [];
  const grantedScopeSet = new Set(grantedScopes);
  const missingAdScopes = REQUIRED_AD_SCOPES.filter((scope) => !grantedScopeSet.has(scope));
  const limitedAccess = missingAdScopes.length > 0;

  const accounts: MetaAdAccount[] = [];
  let after: string | undefined;
  for (let page = 0; !limitedAccess && page < MAX_AD_ACCOUNT_PAGES; page += 1) {
    let response: MetaAdAccountsResponse;
    try {
      const { data } = await axios.get<MetaAdAccountsResponse>(`${graphUrl}/me/adaccounts`, {
        params: {
          fields: 'id,name,account_status,currency',
          limit: 100,
          access_token: accessToken,
          ...(after ? { after } : {}),
        },
        timeout: 15000,
      });
      response = data;
    } catch (error) {
      const details = {
        provider: 'meta',
        ...metaErrorDetails(error, '/me/adaccounts'),
      };
      console.error('[meta] GET /me/adaccounts falló', details);
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        throw new HttpError(
          403,
          'Meta denegó la lectura de las cuentas publicitarias. Comprueba ads_read/ads_management, el acceso avanzado de la app y el acceso de esta persona a la cuenta.',
          details,
        );
      }
      throw new HttpError(
        502,
        'No se pudieron leer las cuentas publicitarias autorizadas en Meta.',
        details,
      );
    }

    accounts.push(...response.data);
    after = response.paging?.cursors?.after;
    if (!after) break;
    if (page === MAX_AD_ACCOUNT_PAGES - 1) {
      throw new HttpError(502, 'Meta devolvió demasiadas cuentas publicitarias para procesarlas.');
    }
  }

  const activeAccounts = accounts.filter(
    (account) => account.account_status === 1 && account.id && account.name,
  );
  if (!limitedAccess && !activeAccounts.length) {
    throw new HttpError(422, 'No encontramos cuentas publicitarias activas en el acceso otorgado.');
  }

  const metaUserId = debug.user_id;
  if (!metaUserId) throw new HttpError(502, 'No se pudo identificar la cuenta autorizada en Meta.');
  if (expectedMetaUserId && metaUserId !== expectedMetaUserId) {
    throw new HttpError(401, 'La autorización de Meta no coincide con la cuenta validada.');
  }

  const expiresAt =
    Number.isFinite(expiresIn) && Number(expiresIn) > 0
      ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
      : null;
  return {
    empresaId,
    metaUserId,
    accounts: activeAccounts,
    encryptedToken: encryptMetaToken(accessToken),
    expiresAt,
    limitedAccess,
    grantedScopes,
    missingAdScopes,
  };
}

export async function deleteMetaUserData(signedRequest: string): Promise<string> {
  assertOAuthConfig();
  const [signaturePart, payloadPart, ...extra] = signedRequest.split('.');
  if (
    extra.length ||
    !signaturePart ||
    !payloadPart ||
    !/^[A-Za-z0-9_-]+$/.test(signaturePart) ||
    !/^[A-Za-z0-9_-]+$/.test(payloadPart)
  ) {
    throw new HttpError(400, 'La solicitud de eliminación de Meta no es válida.');
  }

  const signature = Buffer.from(signaturePart, 'base64url');
  const expected = createHmac('sha256', config.metaOAuth.appSecret)
    .update(payloadPart)
    .digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new HttpError(400, 'La firma de la solicitud de Meta no es válida.');
  }

  let payload: { alg?: string; user_id?: string };
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as typeof payload;
  } catch {
    throw new HttpError(400, 'El contenido de la solicitud de Meta no es válido.');
  }
  if (payload.alg !== 'HMAC-SHA256' || !payload.user_id) {
    throw new HttpError(400, 'La solicitud de Meta no incluye un usuario válido.');
  }

  const { error } = await supabase
    .from('conexiones')
    .delete()
    .eq('meta_user_id', payload.user_id);
  if (error) throw new HttpError(503, 'No se pudieron eliminar los datos asociados a Meta.');
  const { error: authorizationError } = await supabase
    .from('meta_oauth_authorizations')
    .delete()
    .eq('meta_user_id', payload.user_id);
  if (authorizationError) throw new HttpError(503, 'No se pudieron eliminar las autorizaciones limitadas de Meta.');
  return randomBytes(16).toString('hex');
}

export function metaOAuthFrontendUrl(status: string): string {
  assertOAuthConfig();
  const target = new URL('/configuracion', config.metaOAuth.frontendUrl);
  target.searchParams.set('meta', status);
  return target.toString();
}

export function metaDataDeletionStatusUrl(confirmationCode: string): string {
  assertOAuthConfig();
  const target = new URL('/eliminacion-datos.html', config.metaOAuth.frontendUrl);
  target.searchParams.set('meta_deletion', 'complete');
  target.searchParams.set('confirmation_code', confirmationCode);
  return target.toString();
}

export async function saveMetaConnections(input: Awaited<ReturnType<typeof exchangeMetaCode>>): Promise<void> {
  if (input.limitedAccess) {
    const { error } = await supabase.from('meta_oauth_authorizations').upsert({
      empresa_id: input.empresaId,
      meta_user_id: input.metaUserId,
      permisos: { scopes: input.grantedScopes, missing_ad_scopes: input.missingAdScopes },
      access_token_enc: input.encryptedToken,
      token_expira_en: input.expiresAt,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'empresa_id,meta_user_id' });
    if (error) {
      throw new HttpError(503, 'Meta autorizÃ³ el acceso limitado, pero no se pudo guardar la autorizaciÃ³n de prueba.');
    }
    return;
  }

  const { data, error } = await supabase.from('conexiones').upsert(
    input.accounts.map((account) => ({
      empresa_id: input.empresaId,
      meta_user_id: input.metaUserId,
      cuenta_publicitaria_id: account.id,
      nombre_cuenta: account.name,
      meta_currency: account.currency,
      estado: 'conectada',
      permisos: {
        scopes: input.grantedScopes,
      },
      access_token_enc: input.encryptedToken,
      token_expira_en: input.expiresAt,
      actualizado_en: new Date().toISOString(),
    })),
    { onConflict: 'empresa_id,cuenta_publicitaria_id' },
  ).select('conexion_id');

  if (error || !data?.length) {
    throw new HttpError(503, 'Meta autorizó las cuentas, pero no se pudieron guardar en la empresa.');
  }
}
