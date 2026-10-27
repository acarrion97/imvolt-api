// middlewares/security.ts
// Capa de seguridad HTTP: HTTPS/HSTS, cabeceras, CORS con lista blanca y
// rate limiting de los endpoints de autenticación.

import cors from 'cors';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { config } from '../config/global';

/** Rutas que se sirven sin exigir HTTPS (sondas de salud del balanceador). */
const HTTP_EXENTAS = new Set(['/api/health']);

/**
 * Rechaza el HTTP plano en producción. Detrás de un balanceador, `req.secure`
 * depende de `trust proxy` + `X-Forwarded-Proto`. GET/HEAD redirigen (308) al
 * origen HTTPS CONFIGURADO (`PUBLIC_API_URL`, nunca al header Host: evita
 * open redirect); el resto responde 426 sin procesar el cuerpo.
 */
export const requireHttps: RequestHandler = (req, res, next) => {
  if (!config.production || req.secure || HTTP_EXENTAS.has(req.path)) {
    next();
    return;
  }
  if (config.publicApiUrl && (req.method === 'GET' || req.method === 'HEAD')) {
    res.redirect(308, `${config.publicApiUrl}${req.originalUrl}`);
    return;
  }
  res.status(426).json({ message: 'Este servicio solo acepta conexiones HTTPS' });
};

const baseHelmet = {
  // 2 años, subdominios y preload: solo tiene efecto cuando la respuesta va por HTTPS.
  strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
  crossOriginResourcePolicy: { policy: 'same-site' as const },
};

/** API JSON: CSP restrictiva (no sirve HTML) y sin frames. */
const apiHelmet = helmet({
  ...baseHelmet,
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
});

/** Swagger UI necesita scripts/estilos propios: se omite solo la CSP en esa ruta. */
const docsHelmet = helmet({ ...baseHelmet, contentSecurityPolicy: false });

export const securityHeaders: RequestHandler = (req, res, next) =>
  (req.path.startsWith('/documentacion') ? docsHelmet : apiHelmet)(req, res, next);

/** Las respuestas del API (tokens, URLs firmadas, PII) nunca se cachean. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/**
 * CORS con lista blanca (`ALLOWED_ORIGIN`). Sin cookies: la sesión viaja en
 * `Authorization: Bearer`, así que `credentials` queda deshabilitado y un
 * origen no listado simplemente no recibe cabeceras CORS. Las peticiones sin
 * `Origin` (curl, servidor a servidor) no pasan por CORS.
 */
export const corsPolicy = cors({
  origin: (origin, callback) => callback(null, !origin || config.allowedOrigin.includes(origin)),
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Empresa-Id'],
  maxAge: 600,
});

const limiter = (max: number): RequestHandler =>
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req: Request, res: Response, _next: NextFunction) => {
      res.status(429).json({ message: 'Demasiados intentos. Inténtalo de nuevo más tarde.' });
    },
  });

/** POST /auth/login: freno a la fuerza bruta de credenciales (por IP). */
export const loginRateLimit = limiter(config.rateLimit.loginMax);
/** POST /auth/register: freno al alta masiva de empresas/cuentas (por IP). */
export const registerRateLimit = limiter(config.rateLimit.registerMax);
