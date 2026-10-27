// docs/index.ts
// Especificación OpenAPI generada para los módulos CRUD del API.
//
// `src/index.ts` fusiona esta especificación con las rutas documentadas a
// mano (@swagger) en `src/routes/*.ts`:
//
//   const spec = { ...swaggerJsdoc(options), paths: { ...openapiCrudPaths, ...comentadas } }
//
// Así los CRUDs quedan documentados de forma consistente (esquemas, ejemplos
// y respuestas de error compartidas) y los endpoints de negocio conservan su
// documentación junto al router.

import {
  openapiParameters,
  openapiResponses,
  openapiSchemas as errorSchemas,
  openapiTags,
  securitySchemes,
} from './components';
import { crudPaths, CrudDocConfig } from './crud-paths';
import { openapiSchemas } from './schemas';

/** Módulos CRUD del API y sus rutas (deben coincidir con `src/index.ts`). */
export const crudModules: CrudDocConfig[] = [
  // ── Identidad ────────────────────────────────────────────────────────────
  {
    path: '/api/v1/empresas',
    tag: 'Identidad',
    schema: 'Empresa',
    entity: 'Empresa',
    female: true,
    idExample: 1,
    filters: [{ name: 'ruc', description: 'Filtra por RUC exacto', type: 'string', example: '1792345678001' }],
  },
  {
    path: '/api/v1/usuarios',
    tag: 'Identidad',
    schema: 'Usuario',
    entity: 'Usuario',
    idExample: 7,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      { name: 'email', description: 'Filtra por correo exacto', type: 'string', example: 'andrea.salazar@imvolt.ec' },
    ],
  },
  {
    path: '/api/v1/roles',
    tag: 'Identidad',
    schema: 'Rol',
    entity: 'Rol',
    idExample: 2,
    filters: [{ name: 'nombre', description: 'Filtra por nombre del rol', type: 'string', example: 'marketing' }],
  },
  {
    path: '/api/v1/permisos',
    tag: 'Identidad',
    schema: 'Permiso',
    entity: 'Permiso',
    idExample: 5,
    filters: [{ name: 'nombre', description: 'Filtra por nombre del permiso', type: 'string', example: 'publicar_campanas' }],
  },
  {
    path: '/api/v1/roles-usuarios',
    tag: 'Identidad',
    schema: 'UsuarioRol',
    entity: 'Asignación de rol a usuario',
    plural: 'Asignaciones de rol a usuario',
    female: true,
    idExample: 3,
    filters: [
      { name: 'usuario_id', description: 'Filtra por usuario', example: 7 },
      { name: 'rol_id', description: 'Filtra por rol', example: 2 },
    ],
  },
  {
    path: '/api/v1/roles-permisos',
    tag: 'Identidad',
    schema: 'RolPermiso',
    entity: 'Permiso de rol',
    plural: 'Permisos de rol',
    idExample: 11,
    filters: [
      { name: 'rol_id', description: 'Filtra por rol', example: 2 },
      { name: 'permiso_id', description: 'Filtra por permiso', example: 5 },
    ],
  },
  {
    path: '/api/v1/hitos-lanzamiento',
    tag: 'Identidad',
    schema: 'HitoLanzamiento',
    entity: 'Hito de lanzamiento',
    plural: 'Hitos de lanzamiento',
    idExample: 1,
  },
  {
    path: '/api/v1/empresas-hitos',
    tag: 'Identidad',
    schema: 'EmpresaHito',
    entity: 'Hito de la empresa',
    plural: 'Hitos de la empresa',
    idExample: 4,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa', example: 1 },
      { name: 'hito_lanzamiento_id', description: 'Filtra por hito', example: 1 },
    ],
  },
  {
    path: '/api/v1/configuraciones-integraciones',
    tag: 'Identidad',
    schema: 'ConfiguracionIntegracion',
    entity: 'Configuración de integración',
    plural: 'Configuraciones de integración',
    female: true,
    idExample: 2,
    filters: [{ name: 'entorno', description: 'Filtra por entorno', type: 'string', example: 'produccion' }],
  },
  {
    path: '/api/v1/empresas-integraciones',
    tag: 'Identidad',
    schema: 'EmpresaIntegracion',
    entity: 'Integración de la empresa',
    plural: 'Integraciones de la empresa',
    female: true,
    idExample: 6,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa', example: 1 },
      { name: 'integracion_id', description: 'Filtra por tipo de integración', example: 1 },
    ],
  },

  // ── Catálogo ─────────────────────────────────────────────────────────────
  {
    path: '/api/v1/proyectos',
    tag: 'Catálogo',
    schema: 'Proyecto',
    entity: 'Proyecto',
    idExample: 7,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      {
        name: 'tipo',
        description: 'Filtra por tipo de desarrollo',
        type: 'string',
        enum: ['lotizacion', 'urbanizacion', 'edificio', 'proyecto_planos', 'individual'],
      },
    ],
  },
  {
    path: '/api/v1/media-assets',
    tag: 'Catálogo',
    schema: 'MediaAsset',
    entity: 'Media asset',
    idExample: 3,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      {
        name: 'categoria',
        description: 'Filtra por categoría del medio',
        type: 'string',
        enum: ['imagen', 'video', 'documento', 'otro'],
      },
      { name: 'proyecto_id', description: 'Filtra por proyecto del medio', example: 7 },
      { name: 'propiedad_id', description: 'Filtra por propiedad fotografiada', example: 12 },
    ],
  },

  // ── Propiedades ──────────────────────────────────────────────────────────
  {
    path: '/api/v1/propiedades',
    tag: 'Propiedades',
    schema: 'Propiedad',
    entity: 'Propiedad',
    female: true,
    idExample: 3,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      { name: 'tipo_propiedad_id', description: 'Filtra por tipo de inmueble', example: 1 },
      { name: 'proyecto_id', description: 'Filtra por proyecto al que pertenece el inmueble', example: 7 },
      {
        name: 'disponibilidad',
        description: 'Filtra por estado comercial',
        type: 'string',
        enum: ['disponible', 'reservada', 'vendida', 'no_disponible'],
      },
    ],
  },
  {
    path: '/api/v1/tipos-propiedad',
    tag: 'Propiedades',
    schema: 'TipoPropiedad',
    entity: 'Tipo de propiedad',
    plural: 'Tipos de propiedad',
    idExample: 1,
    filters: [{ name: 'nombre', description: 'Filtra por nombre del tipo', type: 'string', example: 'Lote' }],
  },

  // ── Creative ─────────────────────────────────────────────────────────────
  {
    path: '/api/v1/plantillas',
    tag: 'Creative',
    schema: 'Plantilla',
    entity: 'Plantilla',
    female: true,
    idExample: 2,
    filters: [{ name: 'tipo_plantilla_id', description: 'Filtra por categoría de plantilla', example: 1 }],
  },
  {
    path: '/api/v1/tipos-plantilla',
    tag: 'Creative',
    schema: 'TipoPlantilla',
    entity: 'Tipo de plantilla',
    plural: 'Tipos de plantilla',
    idExample: 1,
    filters: [{ name: 'nombre', description: 'Filtra por nombre de la categoría', type: 'string', example: 'terrenos' }],
  },
  {
    path: '/api/v1/formatos',
    tag: 'Creative',
    schema: 'Formato',
    entity: 'Formato',
    idExample: 1,
    filters: [{ name: 'nombre', description: 'Filtra por nombre del formato', type: 'string', example: '9:16 Reels' }],
  },
  {
    path: '/api/v1/enfoques-comerciales',
    tag: 'Creative',
    schema: 'EnfoqueComercial',
    entity: 'Enfoque comercial',
    idExample: 2,
    filters: [{ name: 'nombre', description: 'Filtra por nombre del enfoque', type: 'string', example: 'Inversión' }],
  },
  {
    path: '/api/v1/contenidos-ia',
    tag: 'Creative',
    schema: 'ContenidoIa',
    entity: 'Contenido IA',
    plural: 'Contenidos IA',
    idExample: 9,
    filters: [
      { name: 'propiedad_id', description: 'Filtra por propiedad promocionada', example: 3 },
      { name: 'plantilla_id', description: 'Filtra por plantilla usada', example: 2 },
      { name: 'formato_id', description: 'Filtra por formato de salida', example: 1 },
    ],
  },
  {
    path: '/api/v1/modelos',
    tag: 'Creative',
    schema: 'ModeloIa',
    entity: 'Modelo IA',
    plural: 'Modelos IA',
    idExample: 1,
    disabled: ['create', 'update', 'remove'],
    filters: [
      { name: 'media_type', description: 'Filtra por tipo de medio', type: 'string', enum: ['image', 'video'] },
      { name: 'status', description: 'Filtra por disponibilidad', type: 'string', enum: ['activo', 'inactivo', 'no_disponible'] },
    ],
  },
  {
    path: '/api/v1/creative/generations',
    tag: 'Creative',
    schema: 'Generacion',
    entity: 'Generación',
    plural: 'Generaciones',
    idExample: 19,
    disabled: ['update', 'remove'],
    filters: [{ name: 'property_id', description: 'Filtra por propiedad', type: 'string', example: '3' }],
  },

  // ── Publicidad ───────────────────────────────────────────────────────────
  {
    path: '/api/v1/conexiones',
    tag: 'Publicidad',
    schema: 'Conexion',
    entity: 'Conexión',
    female: true,
    idExample: 2,
    filters: [{ name: 'estado', description: 'Filtra por estado de conexión', type: 'string', enum: ['pendiente', 'conectada', 'revocada'] }],
  },
  {
    path: '/api/v1/campaigns',
    tag: 'Publicidad',
    schema: 'Campaign',
    entity: 'Campaña',
    female: true,
    idExample: 5,
    filters: [
      { name: 'property_id', description: 'Filtra por propiedad', type: 'string', example: '3' },
      { name: 'connection_id', description: 'Filtra por conexión Meta', type: 'string', example: '2' },
      { name: 'estado', description: 'Filtra por etapa del flujo', type: 'string', enum: ['local_draft', 'validated', 'awaiting_approval', 'approved', 'published_paused', 'active', 'rejected', 'failed', 'archived'] },
    ],
  },
  {
    path: '/api/v1/objetivos-publicidad',
    tag: 'Publicidad',
    schema: 'ObjetivoPublicidad',
    entity: 'Objetivo de publicidad',
    idExample: 1,
    filters: [{ name: 'nombre', description: 'Filtra por nombre del objetivo', type: 'string', example: 'Mensajes' }],
  },
  {
    path: '/api/v1/campanias-publicitarias',
    tag: 'Publicidad',
    schema: 'CampaniaPublicitaria',
    entity: 'Campaña publicitaria',
    female: true,
    idExample: 5,
    filters: [
      { name: 'propiedad_id', description: 'Filtra por propiedad promocionada', example: 3 },
      { name: 'objetivo_publicidad_id', description: 'Filtra por objetivo', example: 1 },
    ],
  },

  // ── Leads ────────────────────────────────────────────────────────────────
  {
    path: '/api/v1/leads',
    tag: 'Leads',
    schema: 'Lead',
    entity: 'Lead',
    idExample: 42,
    filters: [
      { name: 'campaign_id', description: 'Filtra por campaña', type: 'string', example: '5' },
      { name: 'property_id', description: 'Filtra por propiedad', type: 'string', example: '3' },
      { name: 'fuente', description: 'Filtra por fuente de captación', type: 'string', enum: ['meta_formulario', 'whatsapp', 'landing', 'manual', 'lotes_al_mando'] },
    ],
  },
  {
    path: '/api/v1/contactos',
    tag: 'Leads',
    schema: 'Contacto',
    entity: 'Contacto',
    idExample: 42,
    filters: [
      {
        name: 'origen',
        description: 'Filtra por canal de captación',
        type: 'string',
        enum: ['meta_formulario', 'whatsapp', 'landing', 'manual', 'referido'],
      },
      { name: 'propiedad_id', description: 'Filtra por inmueble consultado', example: 3 },
    ],
  },

  // ── Créditos ────────────────────────────────────────────────────────────
  {
    path: '/api/v1/billing/transactions',
    tag: 'Créditos',
    schema: 'CreditTransaction',
    entity: 'Movimiento de créditos',
    plural: 'Movimientos de créditos',
    idExample: 1,
    disabled: ['create', 'update', 'remove'],
    filters: [{ name: 'tipo', description: 'Filtra por tipo de movimiento', type: 'string', enum: ['reserva', 'consumo', 'devolucion', 'recarga', 'ajuste'] }],
  },

  // ── Brand Kit ────────────────────────────────────────────────────────────
  {
    path: '/api/v1/brand-assets',
    tag: 'Brand Kit',
    schema: 'BrandAsset',
    entity: 'Archivo de marca',
    female: true,
    idExample: 1,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      {
        name: 'categoria',
        description: 'Filtra por categoría del archivo',
        type: 'string',
        enum: ['logo_horizontal', 'logo_isotipo', 'tipografia', 'imagen_referencia', 'plantilla_documento', 'otro'],
      },
    ],
  },
  {
    path: '/api/v1/brand-colors',
    tag: 'Brand Kit',
    schema: 'BrandColor',
    entity: 'Color de marca',
    idExample: 1,
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      {
        name: 'uso',
        description: 'Filtra por rol del color',
        type: 'string',
        enum: ['principal', 'secundario', 'acento', 'fondo', 'texto'],
      },
    ],
  },

  // ── Auditoría ────────────────────────────────────────────────────────────
  {
    path: '/api/v1/auditoria',
    tag: 'Auditoría',
    schema: 'AuditLog',
    entity: 'Registro de auditoría',
    plural: 'Registros de auditoría',
    idExample: 1284,
    // Solo lectura: la bitácora la escribe el núcleo.
    disabled: ['create', 'update', 'remove'],
    filters: [
      { name: 'empresa_id', description: 'Filtra por empresa (se fuerza desde la sesión)', example: 1 },
      { name: 'tabla', description: 'Filtra por tabla afectada', type: 'string', example: 'propiedades' },
      {
        name: 'accion',
        description: 'Filtra por tipo de acción',
        type: 'string',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REGISTER', 'LOGIN'],
      },
      { name: 'usuario_id', description: 'Filtra por usuario local', example: 7 },
    ],
  },
];

/** Componentes OpenAPI (esquemas, parámetros, respuestas y seguridad). */
export const openapiComponents = {
  securitySchemes,
  parameters: openapiParameters,
  responses: openapiResponses,
  schemas: { ...errorSchemas, ...openapiSchemas },
};

/** Rutas OpenAPI de todos los módulos CRUD. */
export const openapiCrudPaths: Record<string, any> = crudModules.reduce<Record<string, any>>(
  (acc, module) => Object.assign(acc, crudPaths(module)),
  {}
);

/** Operaciones de billing que no son CRUD de un recurso individual. */
export const openapiExtraPaths: Record<string, any> = {
  '/api/v1/billing/wallet': {
    get: {
      tags: ['Créditos'],
      summary: 'Consulta la wallet de la empresa activa',
      responses: {
        200: { description: 'Wallet de créditos', content: { 'application/json': { schema: { $ref: '#/components/schemas/CreditWallet' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/api/v1/billing/recharge': {
    post: {
      tags: ['Créditos'],
      summary: 'Recarga créditos (pasarela simulada)',
      description: 'Disponible para miembros activos. La recarga es un stub de pago y devuelve el saldo actualizado.',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CreditRechargeInput' }, example: { monto: 25, idempotency_key: 'purchase-2026-03-06-001' } } },
      },
      responses: {
        201: { description: 'Wallet actualizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/CreditWallet' } } } },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        402: { description: 'Créditos insuficientes para la operación' },
      },
    },
  },
};

export { openapiTags };
