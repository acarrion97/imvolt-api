// index.ts
// IMVOLT API — MARKETING INMOBILIARIO AI
// Plataforma SaaS de marketing inmobiliario asistido por IA.
//
// Arquitectura: monolito modular Express + TypeScript sobre Supabase, alineada
// al DIAGRAMA RELACIONAL del proyecto. Cada módulo expone su CRUD genérico
// bajo /api/v1:
//
//   identity      /empresas /usuarios /roles /permisos /roles-usuarios
//                 /roles-permisos /hitos-lanzamiento /empresas-hitos
//                 /configuraciones-integraciones /empresas-integraciones
//   catalog       /proyectos /media-assets (CRUD + versiones multipart y URL firmada)
//   property      /propiedades /tipos-propiedad
//   creative      /plantillas /tipos-plantilla /formatos /enfoques-comerciales
//                 /contenidos-ia
//   advertising   /objetivos-publicidad /campanias-publicitarias
//   leads         /contactos
//   brandkit      /brand-assets (CRUD + versiones multipart y URL firmada)
//                 /brand-colors

import express from 'express';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { config } from './config/global';
import authRoutes from './routes/auth.route';
import {
  auditLogRouter,
  configuracionIntegracionRouter,
  empresaHitoRouter,
  empresaIntegracionRouter,
  empresaRouter,
  hitoLanzamientoRouter,
  permisoRouter,
  rolPermisoRouter,
  rolRouter,
  usuarioRolRouter,
  usuarioRouter,
} from './routes/identity.route';
import { propiedadRouter, tipoPropiedadRouter } from './routes/property.route';
import { proyectoRouter, mediaAssetRouter } from './routes/catalog.route';
import {
  contenidoIaRouter,
  enfoqueComercialRouter,
  formatoRouter,
  plantillaRouter,
  tipoPlantillaRouter,
} from './routes/creative.route';
import { campaniaPublicitariaRouter, objetivoPublicidadRouter } from './routes/advertising.route';
import { contactoRouter } from './routes/leads.route';
import { brandAssetRouter, brandColorRouter } from './routes/brandkit.route';
import { asegurarBucket } from './services/brandkit.storage';
import { asegurarBucket as asegurarBucketMedia } from './services/media.storage';
import { corsPolicy, noStore, requireHttps, securityHeaders } from './middlewares/security';
import { errorResponse } from './core/errors';
import { openapiComponents, openapiCrudPaths, openapiTags } from './docs';

dotenv.config();

const app = express();

// ── Seguridad de transporte y cabeceras ─────────────────────────────────────
// `trust proxy` hace que `req.secure`/`req.ip` reflejen X-Forwarded-* SOLO de
// los saltos de confianza configurados (TRUST_PROXY); sin balanceador = false.
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(requireHttps);
app.use(securityHeaders);
app.use(corsPolicy);
app.use('/api', noStore);

// ── Middleware global ────────────────────────────────────────────────────────
// 1 MB para JSON: las subidas de archivos van por multipart (multer, con sus límites).
app.use(express.json({ limit: '1mb' }));

// ── Salud del servicio ──────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    service: 'imvolt-api',
    brand: 'IMVOLT — MARKETING INMOBILIARIO AI',
    status: 'ok',
    simulated: {
      higgsfield: config.higgsfield.simulate,
      meta: config.meta.simulate,
    },
    time: new Date().toISOString(),
  });
});

// ── Registro de rutas ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// identity
app.use('/api/v1/empresas', empresaRouter);
app.use('/api/v1/usuarios', usuarioRouter);
app.use('/api/v1/roles', rolRouter);
app.use('/api/v1/permisos', permisoRouter);
app.use('/api/v1/roles-usuarios', usuarioRolRouter);
app.use('/api/v1/roles-permisos', rolPermisoRouter);
app.use('/api/v1/hitos-lanzamiento', hitoLanzamientoRouter);
app.use('/api/v1/empresas-hitos', empresaHitoRouter);
app.use('/api/v1/configuraciones-integraciones', configuracionIntegracionRouter);
app.use('/api/v1/empresas-integraciones', empresaIntegracionRouter);
app.use('/api/v1/auditoria', auditLogRouter);

// catalog (proyectos + media assets en bucket privado)
app.use('/api/v1/proyectos', proyectoRouter);
app.use('/api/v1/media-assets', mediaAssetRouter);

// property
app.use('/api/v1/propiedades', propiedadRouter);
app.use('/api/v1/tipos-propiedad', tipoPropiedadRouter);

// creative
app.use('/api/v1/plantillas', plantillaRouter);
app.use('/api/v1/tipos-plantilla', tipoPlantillaRouter);
app.use('/api/v1/formatos', formatoRouter);
app.use('/api/v1/enfoques-comerciales', enfoqueComercialRouter);
app.use('/api/v1/contenidos-ia', contenidoIaRouter);

// advertising
app.use('/api/v1/objetivos-publicidad', objetivoPublicidadRouter);
app.use('/api/v1/campanias-publicitarias', campaniaPublicitariaRouter);

// leads
app.use('/api/v1/contactos', contactoRouter);

// brand kit (identidad de marca: archivos en bucket privado + colores)
app.use('/api/v1/brand-assets', brandAssetRouter);
app.use('/api/v1/brand-colors', brandColorRouter);

// ── Documentación Swagger ───────────────────────────────────────────────────
// Combina las rutas comentadas con @swagger (auth) con las rutas CRUD
// generadas desde `src/docs` (esquemas + ejemplos + respuestas de error).
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'IMVOLT API',
      version: '1.0.0',
      description: [
        'API de **IMVOLT — MARKETING INMOBILIARIO AI**: de la propiedad al anuncio, crear, publicar y medir.',
        '',
        '### Cómo usar esta documentación',
        '1. Autentícate en `POST /api/auth/login` y copia el `access_token`.',
        '2. Pulsa **Authorize** 🔒 e ingresa el token (el API lo envía como `Authorization: Bearer <token>`).',
        '3. Cada endpoint de lista acepta filtros por columna exacta (`?empresa_id=1&estado=activo`) y paginación (`?limite=20&pagina=1`).',
        '',
        '### Convenciones',
        '- **Errores**: siempre `{ "message": string, "details"?: [{ field, message }] }`.',
        '- **Multi-empresa**: `usuarios` y `propiedades` se acotan a la empresa del token autenticado.',
        '- **Baja lógica**: los registros se marcan con `estado = inactivo`; los borrados físicos quedan en la auditoría.',
        '- **Simulación**: Higgsfield y Meta operan en modo simulado sin credenciales.',
      ].join('\n'),
      license: { name: 'MIT' },
      contact: { name: 'Soporte IMVOLT', email: 'soporte@imvolt.ec' },
    },
    servers: [
      config.publicApiUrl
        ? { url: config.publicApiUrl, description: 'API publicada (HTTPS)' }
        : { url: `http://localhost:${config.port}`, description: 'Desarrollo local' },
    ],
    tags: openapiTags,
    components: openapiComponents,
    // Todo el API requiere token; /auth/register y /auth/login lo desactivan.
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

const spec = swaggerJsdoc(swaggerOptions) as Record<string, any>;
spec.paths = { ...openapiCrudPaths, ...(spec.paths ?? {}) };

// Identidad visual de la documentación (paleta del manual de marca IMVOLT).
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: 'IMVOLT API — Documentación',
  customCss: `
    .swagger-ui .topbar { background-color: #0f1f18; }
    .swagger-ui .topbar a span { color: #ffffff; }
    .swagger-ui .info .title { color: #008e47; }
    .swagger-ui .info .description p { color: #172321; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background-color: #172321; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method,
    .swagger-ui .opblock.opblock-put .opblock-summary-method,
    .swagger-ui .opblock.opblock-patch .opblock-summary-method { background-color: #008e47; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method { background-color: #bd3b3b; }
    .swagger-ui .btn.execute { background-color: #008e47; border-color: #008e47; }
    .swagger-ui .scheme-container { background: #f5f8f6; box-shadow: none; border: 1px solid #e4ebe8; }
  `,
};

// En producción la documentación queda cerrada salvo ENABLE_DOCS=true.
if (config.enableDocs) {
  app.use('/documentacion', swaggerUi.serve, swaggerUi.setup(spec, swaggerUiOptions));
}

// ── Errores no capturados (JSON mal formado, cuerpo excedido, etc.) ─────────
// Sin esto Express responde con HTML y, fuera de producción, con la traza.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ message: status === 413 ? 'El cuerpo de la petición es demasiado grande' : 'Petición inválida' });
    return;
  }
  const { status: code, body } = errorResponse(error);
  res.status(code).json(body);
});

// ── Arranque ────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`IMVOLT API escuchando en http://localhost:${config.port}`);
  if (config.enableDocs) console.log(`Documentación: http://localhost:${config.port}/documentacion`);
  if (config.higgsfield.simulate) console.log('Higgsfield: MODO SIMULADO (sin API key)');
  if (config.meta.simulate) console.log('Meta: MODO SIMULADO (sin credenciales; solo borradores)');
  // Bucket privado del Brand Kit: lo crea/ajusta (10 MB + MIME) sin bloquear el arranque.
  void asegurarBucket();
  // Bucket privado de Media Assets: lo crea/ajusta (100 MB + MIME) sin bloquear el arranque.
  void asegurarBucketMedia();
});

export default app;
