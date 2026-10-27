// config/env.ts
// Validación de variables de entorno al arrancar (fail-fast).
//
// `validateEnv` es una función PURA (recibe el entorno, devuelve errores y
// avisos) para poder probarla sin tocar `process.env`. Los mensajes nombran la
// variable y la regla incumplida, NUNCA el valor: así un secreto mal pegado no
// termina en los logs.

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const SERVICE_KEY_SHAPE = (value: string): boolean => JWT_SHAPE.test(value) || value.startsWith('sb_secret_');
const ANON_KEY_SHAPE = (value: string): boolean => JWT_SHAPE.test(value) || value.startsWith('sb_publishable_');

const isTrue = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value.trim() === '' ? fallback : value.trim().toLowerCase() === 'true';

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isProduction = (env: Env = process.env): boolean => env.NODE_ENV === 'production';

export function validateEnv(env: Env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = isProduction(env);
  const get = (name: string): string => (env[name] ?? '').trim();

  // ── Supabase: imprescindible en cualquier entorno ──────────────────────────
  const supabaseUrl = get('SUPABASE_URL');
  const parsedSupabase = supabaseUrl ? parseUrl(supabaseUrl) : null;
  if (!supabaseUrl) errors.push('SUPABASE_URL es obligatoria.');
  else if (!parsedSupabase || !/^https?:$/.test(parsedSupabase.protocol)) {
    errors.push('SUPABASE_URL no es una URL válida (https://<proyecto>.supabase.co).');
  } else if (prod && parsedSupabase.protocol !== 'https:') {
    errors.push('SUPABASE_URL debe usar https:// en producción.');
  }

  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) errors.push('SUPABASE_SERVICE_ROLE_KEY es obligatoria.');
  else if (!SERVICE_KEY_SHAPE(serviceKey)) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY no tiene forma de clave válida (JWT "eyJ…" o "sb_secret_…"); ¿quedó el valor de ejemplo?');
  }

  const anonKey = get('SUPABASE_ANON_KEY');
  if (anonKey && !ANON_KEY_SHAPE(anonKey)) {
    errors.push('SUPABASE_ANON_KEY no tiene forma de clave válida (JWT "eyJ…" o "sb_publishable_…").');
  } else if (anonKey && serviceKey && anonKey === serviceKey) {
    errors.push('SUPABASE_ANON_KEY no puede ser igual a SUPABASE_SERVICE_ROLE_KEY.');
  } else if (!anonKey) {
    // Menor privilegio: el login (signInWithPassword) no necesita service role.
    if (prod) errors.push('SUPABASE_ANON_KEY es obligatoria en producción (el login no debe usar la service role key).');
    else warnings.push('SUPABASE_ANON_KEY no definida: el login usará la service role key (solo aceptable en desarrollo).');
  }

  // ── CORS ───────────────────────────────────────────────────────────────────
  const origins = get('ALLOWED_ORIGIN')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (origins.includes('*')) errors.push('ALLOWED_ORIGIN no admite "*": lista los orígenes exactos.');
  for (const origin of origins.filter((item) => item !== '*')) {
    const url = parseUrl(origin);
    if (!url || url.origin !== origin) {
      errors.push(`ALLOWED_ORIGIN contiene un origen inválido ("${origin}"): usa esquema://host[:puerto] sin ruta.`);
    } else if (prod && url.protocol !== 'https:') {
      errors.push(`ALLOWED_ORIGIN contiene un origen sin https en producción ("${origin}").`);
    }
  }
  if (prod && origins.length === 0) errors.push('ALLOWED_ORIGIN es obligatoria en producción.');

  // ── Higgsfield / Meta: si NO se simula, las credenciales son obligatorias ──
  const higgsfieldKeyId = get('HIGGSFIELD_API_KEY_ID');
  const higgsfieldKeySecret = get('HIGGSFIELD_API_KEY_SECRET');
  const hasHiggsfieldCredentials = higgsfieldKeyId !== '' && higgsfieldKeySecret !== '';
  if ((higgsfieldKeyId === '') !== (higgsfieldKeySecret === '')) {
    errors.push('HIGGSFIELD_API_KEY_ID y HIGGSFIELD_API_KEY_SECRET deben configurarse juntos.');
  }
  const higgsfieldSimulate = isTrue(env.HIGGSFIELD_SIMULATE, true) || !hasHiggsfieldCredentials;
  if (!isTrue(env.HIGGSFIELD_SIMULATE, true) && !hasHiggsfieldCredentials) {
    errors.push('HIGGSFIELD_SIMULATE=false requiere HIGGSFIELD_API_KEY_ID y HIGGSFIELD_API_KEY_SECRET.');
  }
  const higgsfieldUrl = get('HIGGSFIELD_BASE_URL');
  if (higgsfieldUrl && parseUrl(higgsfieldUrl)?.protocol !== 'https:') {
    errors.push('HIGGSFIELD_BASE_URL debe ser una URL https://.');
  }

  const directMetaToken = get('META_ACCESS_TOKEN');
  const directMetaAccount = get('META_AD_ACCOUNT_ID');
  const directMetaCreds = directMetaToken !== '' && directMetaAccount !== '';
  if ((directMetaToken === '') !== (directMetaAccount === '')) {
    errors.push('META_ACCESS_TOKEN y META_AD_ACCOUNT_ID deben configurarse juntos para publicación directa.');
  }
  if (directMetaAccount && !/^act_[0-9]+$/.test(directMetaAccount)) {
    errors.push('META_AD_ACCOUNT_ID debe tener formato act_<dígitos>.');
  }
  if (!isTrue(env.META_SIMULATE, true) && !directMetaCreds) {
    errors.push('META_SIMULATE=false requiere META_ACCESS_TOKEN y META_AD_ACCOUNT_ID.');
  }
  if (get('META_API_VERSION') && !/^v\d+\.\d+$/.test(get('META_API_VERSION'))) {
    errors.push('META_API_VERSION debe tener la forma "v21.0".');
  }

  if (prod && (higgsfieldSimulate || !directMetaCreds || isTrue(env.META_SIMULATE, true))) {
    warnings.push('Producción con Higgsfield o Meta en MODO SIMULADO: revisa HIGGSFIELD_* / META_*.');
  }

  // ── Red / HTTPS ────────────────────────────────────────────────────────────
  const publicUrl = get('PUBLIC_API_URL');
  if (publicUrl) {
    const url = parseUrl(publicUrl);
    if (!url || url.origin !== publicUrl) errors.push('PUBLIC_API_URL debe ser un origen (https://api.ejemplo.com) sin ruta.');
    else if (prod && url.protocol !== 'https:') errors.push('PUBLIC_API_URL debe usar https:// en producción.');
  } else if (prod) {
    warnings.push('PUBLIC_API_URL no definida: el HTTP plano se rechazará con 426 en lugar de redirigir a HTTPS.');
  }

  const trustProxy = get('TRUST_PROXY');
  if (trustProxy && !/^(\d+|true|false|loopback|linklocal|uniquelocal)$/i.test(trustProxy)) {
    errors.push('TRUST_PROXY debe ser un número de saltos (1), true/false, o loopback|linklocal|uniquelocal.');
  }

  const port = get('PORT');
  if (port && !(Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) < 65536)) {
    errors.push('PORT debe ser un puerto válido (1-65535).');
  }

  for (const name of ['AUTH_RATE_LIMIT_LOGIN_MAX', 'AUTH_RATE_LIMIT_REGISTER_MAX', 'AUTH_RATE_LIMIT_WINDOW_MINUTES']) {
    const value = get(name);
    if (value && !(Number.isInteger(Number(value)) && Number(value) > 0)) errors.push(`${name} debe ser un entero positivo.`);
  }

  const admins = get('PLATFORM_ADMIN_EMAILS');
  if (admins && admins.split(',').some((email) => !/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(email.trim()))) {
    errors.push('PLATFORM_ADMIN_EMAILS debe ser una lista de correos separados por comas.');
  }

  return { errors, warnings };
}

/** Valida y, si hay errores, aborta el arranque con un mensaje accionable. */
export function assertEnv(env: Env = process.env): EnvReport {
  const report = validateEnv(env);
  for (const warning of report.warnings) console.warn(`[config] ⚠ ${warning}`);
  if (report.errors.length) {
    throw new Error(
      `Configuración inválida (${report.errors.length}):\n` +
        report.errors.map((error) => `  - ${error}`).join('\n') +
        '\nRevisa .env / las variables del entorno (ver .env.example y README → Seguridad).'
    );
  }
  return report;
}
