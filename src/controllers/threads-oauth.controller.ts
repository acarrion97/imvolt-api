import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import { RequestHandler, Router } from 'express';
import { config } from '../config/global';

const STATE_TTL_MS = 10 * 60 * 1000;
const GRAPH_API_URL = 'https://graph.threads.com/v1.0';
const AUTHORIZATION_URL = 'https://www.threads.com/oauth/authorize';

interface ThreadsTokenResponse {
  access_token?: string;
  user_id?: string | number;
  error_message?: string;
}

interface ThreadsProfile {
  id?: string;
  username?: string;
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] ?? char;
  });
}

function htmlPage(title: string, body: string, status = 200) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} · IMVOLT</title><body style="font:16px system-ui,sans-serif;max-width:680px;margin:12vh auto;padding:24px;color:#172321"><p style="color:#008e47;font-weight:700">IMVOLT · Threads API</p><h1>${htmlEscape(title)}</h1>${body}</body></html>`;
}

function assertThreadsOAuthConfig(): void {
  const { appId, appSecret, redirectUri } = config.threadsOAuth;
  let parsedRedirect: URL | null = null;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch {
    // Report the same safe configuration error below without exposing values.
  }

  if (
    !appId ||
    !appSecret ||
    !parsedRedirect ||
    parsedRedirect.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(parsedRedirect.hostname)
  ) {
    throw new Error('Configura THREADS_APP_ID, THREADS_APP_SECRET y una THREADS_REDIRECT_URI pública HTTPS.');
  }
}

function createSignedState(): string {
  const payload = Buffer.from(JSON.stringify({
    nonce: randomBytes(32).toString('hex'),
    expires_at: Date.now() + STATE_TTL_MS,
  })).toString('base64url');
  const signature = createHmac('sha256', config.threadsOAuth.appSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function validState(state: string): boolean {
  const [payload, signature, extra] = state.split('.');
  if (!payload || !signature || extra || !/^[\da-f]{64}$/i.test(signature)) return false;

  const expected = createHmac('sha256', config.threadsOAuth.appSecret).update(payload).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      nonce?: unknown;
      expires_at?: unknown;
    };
    return (
      typeof parsed.nonce === 'string' &&
      /^[\da-f]{64}$/i.test(parsed.nonce) &&
      typeof parsed.expires_at === 'number' &&
      parsed.expires_at > Date.now()
    );
  } catch {
    return false;
  }
}

const startThreadsOAuth: RequestHandler = (_req, res) => {
  try {
    assertThreadsOAuthConfig();
    const authorize = new URL(AUTHORIZATION_URL);
    authorize.searchParams.set('client_id', config.threadsOAuth.appId);
    authorize.searchParams.set('redirect_uri', config.threadsOAuth.redirectUri);
    authorize.searchParams.set('scope', 'threads_basic');
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('state', createSignedState());
    res.redirect(302, authorize.toString());
  } catch (error) {
    res.status(503).type('html').send(htmlPage(
      'Conexión Threads no configurada',
      `<p>${htmlEscape(error instanceof Error ? error.message : 'Revisa la configuración del servidor.')}</p>`,
      503,
    ));
  }
};

const callbackThreadsOAuth: RequestHandler = async (req, res) => {
  try {
    assertThreadsOAuthConfig();
  } catch (error) {
    res.status(503).type('html').send(htmlPage(
      'Conexión Threads no configurada',
      `<p>${htmlEscape(error instanceof Error ? error.message : 'Revisa la configuración del servidor.')}</p>`,
      503,
    ));
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!state || state.length > 2048 || !validState(state)) {
    res.status(400).type('html').send(htmlPage(
      'No se pudo validar la autorización',
      '<p>El estado OAuth no es válido o expiró. Vuelve a iniciar la conexión desde la API.</p>',
      400,
    ));
    return;
  }

  const providerError = typeof req.query.error === 'string' ? req.query.error : '';
  if (providerError) {
    const frontendUrl = config.metaOAuth.frontendUrl;
    if (frontendUrl) {
      try {
        const target = new URL('/configuracion', frontendUrl);
        target.searchParams.set('threads', 'cancelled');
        res.redirect(302, target.toString());
        return;
      } catch {
        // Fallback al HTML
      }
    }
    res.status(400).type('html').send(htmlPage(
      'Autorización cancelada',
      '<p>No se concedió el acceso a Threads. Puedes cerrar esta pestaña.</p>',
      400,
    ));
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code.replace(/#_$/, '') : '';
  if (!code || code.length > 4096) {
    res.status(400).type('html').send(htmlPage(
      'Threads no devolvió el código',
      '<p>Vuelve a iniciar la autorización e inténtalo de nuevo.</p>',
      400,
    ));
    return;
  }

  try {
    const tokenResponse = await axios.post<ThreadsTokenResponse>(
      `${GRAPH_API_URL}/oauth/access_token`,
      new URLSearchParams({
        client_id: config.threadsOAuth.appId,
        client_secret: config.threadsOAuth.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.threadsOAuth.redirectUri,
        code,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new Error('Threads no emitió un token.');

    // Este callback solo verifica threads_basic: el token no se persiste ni se
    // devuelve al navegador. Solo mostramos los campos mínimos para probarlo.
    const profileResponse = await axios.get<ThreadsProfile>(`${GRAPH_API_URL}/me`, {
      params: { fields: 'id,username', access_token: accessToken },
      timeout: 20000,
    });
    const profile = profileResponse.data;
    if (!profile.id || !profile.username) throw new Error('Threads no devolvió el perfil básico.');

    const frontendUrl = config.metaOAuth.frontendUrl;
    if (frontendUrl) {
      try {
        const target = new URL('/configuracion', frontendUrl);
        target.searchParams.set('threads', 'connected');
        target.searchParams.set('threads_username', profile.username);
        target.searchParams.set('threads_id', profile.id);
        res.redirect(302, target.toString());
        return;
      } catch {
        // Fallback al HTML
      }
    }

    res.status(200).type('html').send(htmlPage(
      'Prueba de Threads completada',
      `<p>IMVOLT autorizó y consultó el perfil de Threads con <code>threads_basic</code>.</p><p>Cuenta: <strong>@${htmlEscape(profile.username)}</strong></p><p>ID de perfil: <code>${htmlEscape(profile.id)}</code></p><p>El token se usó en el servidor para esta comprobación y no se guardó ni se mostró.</p>`,
    ));
  } catch {
    console.error('[threads][oauth] no se pudo completar la prueba threads_basic');
    const frontendUrl = config.metaOAuth.frontendUrl;
    if (frontendUrl) {
      try {
        const target = new URL('/configuracion', frontendUrl);
        target.searchParams.set('threads', 'error');
        res.redirect(302, target.toString());
        return;
      } catch {
        // Fallback al HTML
      }
    }
    res.status(502).type('html').send(htmlPage(
      'No se pudo verificar el perfil de Threads',
      '<p>Meta no completó el intercambio del código o la consulta del perfil. Revisa las credenciales Threads de la API, el permiso autorizado y que la URL de redirección coincida exactamente.</p>',
      502,
    ));
  }
};

export const threadsOAuthRouter = Router();
threadsOAuthRouter.get('/start', startThreadsOAuth);
threadsOAuthRouter.get('/callback', callbackThreadsOAuth);
