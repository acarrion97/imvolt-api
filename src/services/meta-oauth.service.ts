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
import { HttpError } from '../core/errors';

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
}

interface MetaAdAccountsResponse {
  data: MetaAdAccount[];
  paging?: { cursors?: { after?: string } };
}

interface MetaUserResponse {
  id: string;
}

function assertOAuthConfig(): void {
  const { appId, appSecret, tokenEncryptionKey, callbackUrl, frontendUrl } = config.metaOAuth;
  if (!appId || !appSecret || !tokenEncryptionKey || !callbackUrl || !frontendUrl) {
    throw new HttpError(503, 'La conexión OAuth de Meta no está configurada en el servidor.');
  }
}

function encryptionKey(): Buffer {
  assertOAuthConfig();
  return Buffer.from(config.metaOAuth.tokenEncryptionKey, 'hex');
}

export async function createMetaAuthorizationUrl(empresaId: string): Promise<string> {
  assertOAuthConfig();
  const state = randomBytes(32).toString('hex');
  const stateHash = createHash('sha256').update(state).digest('hex');
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();

  const authorizationUrl = new URL(
    `https://www.facebook.com/${config.metaOAuth.graphApiVersion}/dialog/oauth`,
  );
  authorizationUrl.searchParams.set('client_id', config.metaOAuth.appId);
  authorizationUrl.searchParams.set('redirect_uri', config.metaOAuth.callbackUrl);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'ads_management,ads_read');
  authorizationUrl.searchParams.set('state', state);

  const { error } = await supabase
    .from('meta_oauth_states')
    .insert({
      state_hash: stateHash,
      empresa_id: Number(empresaId),
      expira_en: expiresAt,
    });
  if (error) throw new HttpError(503, 'No se pudo iniciar de forma segura la conexión con Meta.');
  return authorizationUrl.toString();
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
}> {
  assertOAuthConfig();

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

  const accounts: MetaAdAccount[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_AD_ACCOUNT_PAGES; page += 1) {
    let response: MetaAdAccountsResponse;
    try {
      const { data } = await axios.get<MetaAdAccountsResponse>(`${graphUrl}/me/adaccounts`, {
        params: {
          fields: 'id,name,account_status',
          limit: 100,
          access_token: accessToken,
          ...(after ? { after } : {}),
        },
        timeout: 15000,
      });
      response = data;
    } catch {
      throw new HttpError(502, 'No se pudieron leer las cuentas publicitarias autorizadas en Meta.');
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
  if (!activeAccounts.length) {
    throw new HttpError(422, 'No encontramos cuentas publicitarias activas en el acceso otorgado.');
  }

  let metaUserId: string;
  try {
    const { data } = await axios.get<MetaUserResponse>(`${graphUrl}/me`, {
      params: { fields: 'id', access_token: accessToken },
      timeout: 15000,
    });
    metaUserId = data.id;
    if (!metaUserId) throw new Error('Missing Meta user id');
  } catch {
    throw new HttpError(502, 'No se pudo identificar la cuenta autorizada en Meta.');
  }

  const expiresAt =
    Number.isFinite(expiresIn) && Number(expiresIn) > 0
      ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
      : null;
  return {
    empresaId: oauthState.empresaId,
    metaUserId,
    accounts: activeAccounts,
    encryptedToken: encryptMetaToken(accessToken),
    expiresAt,
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
  const { data, error } = await supabase.from('conexiones').upsert(
    input.accounts.map((account) => ({
      empresa_id: input.empresaId,
      meta_user_id: input.metaUserId,
      cuenta_publicitaria_id: account.id,
      nombre_cuenta: account.name,
      estado: 'conectada',
      permisos: { scopes: ['ads_management', 'ads_read'] },
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
