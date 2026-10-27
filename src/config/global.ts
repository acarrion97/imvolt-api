import dotenv from 'dotenv';
dotenv.config();

export const {
  NODE_ENV = 'development',
  PORT = '',
  ALLOWED_ORIGIN = 'http://localhost:5173',
  TRUST_PROXY_HOPS = '0',
  SUPABASE_URL = '',
  SUPABASE_SERVICE_ROLE_KEY = '',
  HIGGSFIELD_BASE_URL = 'https://api.higgsfield.ai',
  HIGGSFIELD_API_KEY = '',
  HIGGSFIELD_SIMULATE = 'true',
  META_APP_ID = '',
  META_APP_SECRET = '',
  META_API_VERSION = 'v21.0',
  META_SIMULATE = 'true',
  DEFAULT_ORGANIZATION_ID = '',
} = process.env;

const asBool = (value: string, fallback: boolean): boolean =>
  value === '' ? fallback : value.toLowerCase() === 'true';

const trustProxyHops = Number(TRUST_PROXY_HOPS);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS debe ser un entero mayor o igual a 0.');
}

const allowedOrigins = ALLOWED_ORIGIN.split(',').map((origin) => origin.trim());

export const config = {
  environment: NODE_ENV,
  production: NODE_ENV === 'production',
  port: Number(PORT) || 3000,
  allowedOrigin: allowedOrigins,
  trustProxyHops,
  defaultOrganizationId: DEFAULT_ORGANIZATION_ID,
  db: {
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
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

export function validateRuntimeConfig(): void {
  if (!config.production) return;

  if (config.trustProxyHops < 1) {
    throw new Error('En producción configura TRUST_PROXY_HOPS según tu proxy HTTPS.');
  }

  if (!config.db.url || !config.db.serviceRoleKey) {
    throw new Error('En producción SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.');
  }

  const isHttpsUrl = (value: string): boolean => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  };

  if (!isHttpsUrl(config.db.url)) {
    throw new Error('SUPABASE_URL debe usar HTTPS en producción.');
  }

  if (config.allowedOrigin.some((origin) => !isHttpsUrl(origin))) {
    throw new Error('ALLOWED_ORIGIN solo puede contener orígenes HTTPS en producción.');
  }

  if (/TU[-_ ]|CHANGE[-_ ]?ME|REPLACE[-_ ]?ME/i.test(config.db.serviceRoleKey)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY parece contener un valor de ejemplo.');
  }
}
