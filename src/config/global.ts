import dotenv from 'dotenv';
import { assertEnv, isProduction } from './env';
dotenv.config();

// Falla rápido (y sin imprimir valores) si falta o es inválida alguna variable.
assertEnv();

export const {
  PORT = '',
  ALLOWED_ORIGIN = 'http://localhost:5173',
  SUPABASE_URL = '',
  SUPABASE_SERVICE_ROLE_KEY = '',
  SUPABASE_ANON_KEY = '',
  DEFAULT_ORGANIZATION_ID = '',
  PUBLIC_API_URL = '',
  TRUST_PROXY = '',
  ENABLE_DOCS = '',
  PLATFORM_ADMIN_EMAILS = '',
  AUTH_RATE_LIMIT_LOGIN_MAX = '',
  AUTH_RATE_LIMIT_REGISTER_MAX = '',
  AUTH_RATE_LIMIT_WINDOW_MINUTES = '',
  META_APP_ID = '',
  META_APP_SECRET = '',
  THREADS_APP_ID = '',
  THREADS_APP_SECRET = '',
  THREADS_REDIRECT_URI = '',
  META_TOKEN_ENCRYPTION_KEY = '',
  META_OAUTH_ALLOW_LIMITED_ACCESS = '',
  META_WEBHOOK_VERIFY_TOKEN = '',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN = '',
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY = '',
  PUBLIC_FRONTEND_URL = '',
  META_GRAPH_API_VERSION = '',
  LOTES_ALMANDO_API_URL = '',
  // WhatsApp Cloud API — número de prueba (solo backend; nunca al navegador).
  WHATSAPP_ID_TEST = '',
  WHATSAPP_TOKEN_TEST = '',
  WHATSAPP_PHONE_TEST = '',
  WHATSAPP_GRAPH_VERSION = '',
  WHATSAPP_TEST_ENABLED = '',
  WHATSAPP_TEST_TEMPLATE_NAME = '',
  WHATSAPP_TEST_TEMPLATE_LANGUAGE = '',
  // OpenRouter — generación temporal de imágenes.
  OPENROUTER_IMAGE_MODEL = '',
  OPENROUTER_IMAGE_SIMULATE = '',
  OPENROUTER_IMAGE_FALLBACK = '',
  OPENROUTER_IMAGE_TIMEOUT_MS = '',
} = process.env;

const asBool = (value: string, fallback: boolean): boolean =>
  value === '' ? fallback : value.toLowerCase() === 'true';

const asList = (value: string): string[] =>
  value.split(',').map((item) => item.trim().replace(/\/$/, '')).filter(Boolean);

const asPositiveInt = (value: string, fallback: number): number =>
  Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

const production = isProduction();

/** `trust proxy` de Express: nº de saltos (por defecto 1 en producción, tras un balanceador). */
const parseTrustProxy = (value: string): boolean | number | string => {
  if (value === '') return production ? 1 : false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
};

export const config = {
  production,
  port: Number(PORT) || 3000,
  allowedOrigin: asList(ALLOWED_ORIGIN),
  defaultOrganizationId: DEFAULT_ORGANIZATION_ID,
  publicApiUrl: PUBLIC_API_URL,
  trustProxy: parseTrustProxy(TRUST_PROXY),
  /** Swagger UI: abierto en desarrollo; en producción solo con ENABLE_DOCS=true. */
  enableDocs: asBool(ENABLE_DOCS, !production),
  /** Correos con permiso de escribir en los catálogos GLOBALES (roles, permisos, formatos…). */
  platformAdmins: asList(PLATFORM_ADMIN_EMAILS).map((email) => email.toLowerCase()),
  lotesAlmandoURL: LOTES_ALMANDO_API_URL,
  rateLimit: {
    windowMs: asPositiveInt(AUTH_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    loginMax: asPositiveInt(AUTH_RATE_LIMIT_LOGIN_MAX, 10),
    registerMax: asPositiveInt(AUTH_RATE_LIMIT_REGISTER_MAX, 5),
  },
  metaOAuth: {
    appId: META_APP_ID.trim(),
    appSecret: META_APP_SECRET.trim(),
    tokenEncryptionKey: META_TOKEN_ENCRYPTION_KEY.trim(),
    frontendUrl: PUBLIC_FRONTEND_URL.trim().replace(/\/$/, ''),
    graphApiVersion: META_GRAPH_API_VERSION.trim() || 'v24.0',
    // Temporary review/testing mode: save OAuth grants without ads permissions,
    // but do not expose them as an ad-account connection.
    allowLimitedAccess: asBool(META_OAUTH_ALLOW_LIMITED_ACCESS, false),
    callbackUrl: PUBLIC_API_URL
      ? `${PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/conexiones/meta/oauth/callback`
      : '',
  },
  threadsOAuth: {
    appId: THREADS_APP_ID.trim(),
    appSecret: THREADS_APP_SECRET.trim(),
    redirectUri: THREADS_REDIRECT_URI.trim(),
    authorizationUrl: 'https://www.threads.com/oauth/authorize',
    graphApiUrl: 'https://graph.threads.com/v1.0',
  },
  metaWebhookVerifyToken: META_WEBHOOK_VERIFY_TOKEN.trim(),
  whatsappWebhookVerifyToken: WHATSAPP_WEBHOOK_VERIFY_TOKEN.trim(),
  /**
   * Número de prueba de WhatsApp Cloud API. Se usa SOLO desde el backend para
   * los endpoints /api/v1/whatsapp/test. En producción, cambiar a credenciales
   * productivas y desactivar WHATSAPP_TEST_ENABLED.
   */
  whatsappTest: {
    enabled: asBool(WHATSAPP_TEST_ENABLED, false),
    phoneNumberId: WHATSAPP_ID_TEST.trim(),
    token: WHATSAPP_TOKEN_TEST.trim(),
    recipient: WHATSAPP_PHONE_TEST.trim(),
    graphVersion: WHATSAPP_GRAPH_VERSION.trim() || 'v25.0',
    template: WHATSAPP_TEST_TEMPLATE_NAME.trim() || 'jaspers_market_plain_text_v1',
    language: WHATSAPP_TEST_TEMPLATE_LANGUAGE.trim() || 'en_US',
  },
  /** OpenRouter para generar imágenes mientras se prueba el flujo de anuncios. */
  openRouterImage: {
    apiKey: (process.env.OPENROUTER_API_KEY ?? '').trim(),
    model: OPENROUTER_IMAGE_MODEL.trim() || 'google/gemini-3.1-flash-lite-image',
    simulate: asBool(OPENROUTER_IMAGE_SIMULATE, false),
    fallback: asBool(OPENROUTER_IMAGE_FALLBACK, true),
    timeoutMs: Math.min(120000, Math.max(5000, asPositiveInt(OPENROUTER_IMAGE_TIMEOUT_MS, 60000))),
  },
  integrationCredentialsEncryptionKey: INTEGRATION_CREDENTIALS_ENCRYPTION_KEY.trim(),
  db: {
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    /** Clave pública: la usa el login para no ejecutar signInWithPassword con la service role. */
    anonKey: SUPABASE_ANON_KEY,
  },
};
