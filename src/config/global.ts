import dotenv from 'dotenv';
dotenv.config();

export const {
  PORT = '',
  ALLOWED_ORIGIN = 'http://localhost:5173',
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

export const config = {
  port: Number(PORT) || 3000,
  allowedOrigin: ALLOWED_ORIGIN.split(',').map((origin) => origin.trim()),
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
