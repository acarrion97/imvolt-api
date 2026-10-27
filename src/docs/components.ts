// docs/components.ts
// Componentes reutilizables de la especificación OpenAPI 3.1 (Swagger):
// seguridad, esquema de error, parámetros comunes y respuestas de error.
//
// Se cargan en `index.ts` dentro de `swaggerOptions.definition.components`,
// de modo que los endpoints usan `$ref: '#/components/...'` y la documentación
// queda consistente en todo el API.

/** Etiquetas (agrupaciones) de la UI de Swagger. */
export const openapiTags = [
  { name: 'Autenticación', description: 'Registro, inicio de sesión y perfil del usuario IMVOLT' },
  { name: 'Identidad', description: 'Empresas, usuarios, roles, permisos, hitos de lanzamiento e integraciones' },
  { name: 'Catálogo', description: 'Proyectos inmobiliarios y media assets (medios en bucket privado con versiones)' },
  { name: 'Propiedades', description: 'Catálogo de inmuebles y tipos de propiedad (RF-02)' },
  { name: 'Creative', description: 'Plantillas, formatos, enfoques comerciales y contenidos generados con IA (RF-04 / RF-05)' },
  { name: 'Publicidad', description: 'Objetivos y campañas publicitarias de IMVOLT Ads (RF-07 / RF-08)' },
  { name: 'Leads', description: 'Contactos captados por campañas, formularios o registro manual (RF-10)' },
  { name: 'Créditos', description: 'Wallet, recargas y movimientos del ledger de créditos de generación (RF-06)' },
  { name: 'Auditoría', description: 'Bitácora de solo lectura: quién hizo qué, sobre qué tabla y dentro de qué empresa (RF-09)' },
  { name: 'Brand Kit', description: 'Archivos de marca y colores de la paleta: versiones en bucket privado y descargas con URL firmada' },
];

export const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token de Supabase Auth. Se obtiene en `POST /api/auth/login` y se envía como `Authorization: Bearer <access_token>`.',
  },
};

export const openapiParameters = {
  IdPath: {
    name: 'id',
    in: 'path',
    required: true,
    description: 'Identificador único del registro',
    schema: { type: 'integer', example: 1 },
  },
  Limite: {
    name: 'limite',
    in: 'query',
    description: 'Tamaño de la página (máx. 100)',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 },
  },
  Pagina: {
    name: 'pagina',
    in: 'query',
    description: 'Página a devolver (empieza en 1). Requiere `limite`.',
    schema: { type: 'integer', minimum: 1, default: 1, example: 1 },
  },
  Estado: {
    name: 'estado',
    in: 'query',
    description: 'Filtra por estado lógico',
    schema: { type: 'string', enum: ['activo', 'inactivo'], example: 'activo' },
  },
};

export const openapiSchemas = {
  Error: {
    type: 'object',
    description: 'Respuesta de error estandarizada del API',
    properties: {
      message: { type: 'string', description: 'Descripción legible del error' },
      details: {
        type: 'array',
        description: 'Detalle por campo (solo en errores de validación, 400)',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    example: {
      message: 'Datos de entrada inválidos',
      details: [{ field: 'nombre', message: '"nombre" is required' }],
    },
  },
  Mensaje: {
    type: 'object',
    description: 'Confirmación simple de una operación',
    properties: { message: { type: 'string' } },
    example: { message: 'Registro eliminado correctamente' },
  },
  BrandAssetDescarga: {
    type: 'object',
    description:
      'Descarga autorizada de un blob del bucket privado `brand-kit`: la API valida sesión y tenant y devuelve una URL firmada de corta duración.',
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'URL firmada; caduca a los `expira_en_segundos`.',
        example: 'https://<proyecto>.supabase.co/storage/v1/object/sign/brand-kit/empresa_1/1/v3-logo.png?token=eyJhbGciOi...',
      },
      expira_en_segundos: { type: 'integer', example: 300, description: 'Vigencia de la URL (5 minutos)' },
      nombre_archivo: { type: 'string', example: 'logo-horizontal-v3.png', description: 'Nombre sugerido para la descarga' },
      mime_type: { type: 'string', nullable: true, example: 'image/png' },
      tamano_bytes: { type: 'integer', nullable: true, example: 48213 },
      numero: { type: 'integer', example: 3, description: 'Versión que se está sirviendo' },
    },
    required: ['url', 'expira_en_segundos', 'nombre_archivo', 'numero'],
    example: {
      url: 'https://<proyecto>.supabase.co/storage/v1/object/sign/brand-kit/empresa_1/1/v3-logo.png?token=eyJhbGciOi...',
      expira_en_segundos: 300,
      nombre_archivo: 'logo-horizontal-v3.png',
      mime_type: 'image/png',
      tamano_bytes: 48213,
      numero: 3,
    },
  },
  MediaAssetDescarga: {
    type: 'object',
    description:
      'Descarga autorizada de un blob del bucket privado `media-assets`: la API valida sesión y tenant y devuelve una URL firmada de corta duración.',
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'URL firmada; caduca a los `expira_en_segundos`.',
        example: 'https://<proyecto>.supabase.co/storage/v1/object/sign/media-assets/empresa_1/1/v2-render-norte.mp4?token=eyJhbGciOi...',
      },
      expira_en_segundos: { type: 'integer', example: 300, description: 'Vigencia de la URL (5 minutos)' },
      nombre_archivo: { type: 'string', example: 'render-norte-v2.mp4', description: 'Nombre sugerido para la descarga' },
      mime_type: { type: 'string', nullable: true, example: 'video/mp4' },
      tamano_bytes: { type: 'integer', nullable: true, example: 48213012 },
      numero: { type: 'integer', example: 2, description: 'Versión que se está sirviendo' },
    },
    required: ['url', 'expira_en_segundos', 'nombre_archivo', 'numero'],
    example: {
      url: 'https://<proyecto>.supabase.co/storage/v1/object/sign/media-assets/empresa_1/1/v2-render-norte.mp4?token=eyJhbGciOi...',
      expira_en_segundos: 300,
      nombre_archivo: 'render-norte-v2.mp4',
      mime_type: 'video/mp4',
      tamano_bytes: 48213012,
      numero: 2,
    },
  },
};

/** Respuestas de error reutilizadas por todos los endpoints. */
export const openapiResponses = {
  BadRequest: {
    description: 'Datos de entrada inválidos (validación Joi)',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
  Unauthorized: {
    description: 'Token ausente, inválido o expirado',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { message: 'Token de autenticación inválido o expirado' },
      },
    },
  },
  Forbidden: {
    description: 'El rol de la empresa no tiene permiso para la acción',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { message: 'Tu rol "lector" no tiene permiso para esta acción. Requiere: propietario o administrador.' },
      },
    },
  },
  NotFound: {
    description: 'Registro inexistente (o perteneciente a otra empresa)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { message: "Registro de 'propiedades' con id 999 no encontrado" },
      },
    },
  },
  ServerError: {
    description: 'Error interno del servidor',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { message: "Error al consultar la tabla 'propiedades'" },
      },
    },
  },
};
