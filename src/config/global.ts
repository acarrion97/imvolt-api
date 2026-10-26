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
  HIGGSFIELD_BASE_URL = 'https://api.higgsfield.ai',
  HIGGSFIELD_API_KEY = '',
  HIGGSFIELD_SIMULATE = 'true',
  META_APP_ID = '',
  META_APP_SECRET = '',
  META_API_VERSION = 'v21.0',
  META_SIMULATE = 'true',
  DEFAULT_ORGANIZATION_ID = '',
  PUBLIC_API_URL = '',
  TRUST_PROXY = '',
  ENABLE_DOCS = '',
  PLATFORM_ADMIN_EMAILS = '',
  AUTH_RATE_LIMIT_LOGIN_MAX = '',
  AUTH_RATE_LIMIT_REGISTER_MAX = '',
  AUTH_RATE_LIMIT_WINDOW_MINUTES = '',
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
  rateLimit: {
    windowMs: asPositiveInt(AUTH_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    loginMax: asPositiveInt(AUTH_RATE_LIMIT_LOGIN_MAX, 10),
    registerMax: asPositiveInt(AUTH_RATE_LIMIT_REGISTER_MAX, 5),
  },
  db: {
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    /** Clave pública: la usa el login para no ejecutar signInWithPassword con la service role. */
    anonKey: SUPABASE_ANON_KEY,
  },
  higgsfield: {
    baseUrl: HIGGSFIELD_BASE_URL.replace(/\/+$/, ''),
    apiKey: HIGGSFIELD_API_KEY,
    /** Sin API key la generación se simula para poder desarrollar el MVP. */
    simulate: asBool(HIGGSFIELD_SIMULATE, true) || HIGGSFIELD_API_KEY === '',
  },
  meta: {
    appId: META_APP_ID,
    appSecret: META_APP_SECRET,
    apiVersion: META_API_VERSION,
    /** Sin credenciales no se publica en Meta: se trabaja con borradores. */
    simulate: asBool(META_SIMULATE, true) || META_APP_ID === '',
  },
};
