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
  META_TOKEN_ENCRYPTION_KEY = '',
  META_WEBHOOK_VERIFY_TOKEN = '',
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY = '',
  PUBLIC_FRONTEND_URL = '',
  META_GRAPH_API_VERSION = '',
  LOTES_ALMANDO_API_URL = '',
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
    callbackUrl: PUBLIC_API_URL
      ? `${PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/conexiones/meta/oauth/callback`
      : '',
  },
  metaWebhookVerifyToken: META_WEBHOOK_VERIFY_TOKEN.trim(),
  integrationCredentialsEncryptionKey: INTEGRATION_CREDENTIALS_ENCRYPTION_KEY.trim(),
  db: {
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    /** Clave pública: la usa el login para no ejecutar signInWithPassword con la service role. */
    anonKey: SUPABASE_ANON_KEY,
  },
};
