// docs/schemas.ts
// Esquemas OpenAPI de las 20 entidades del diagrama relacional.
//
// Por cada entidad se generan DOS esquemas:
//
//   Empresa       → forma COMPLETA del registro (incluye id, estado y fechas)
//   EmpresaInput  → payload de creación/actualización (solo campos escribibles)
//
// El esquema de entrada se deriva del completo quitando los campos de solo
// lectura, de modo que la documentación nunca se desalinea del modelo.

type Prop = Record<string, any>;

interface EntityDef {
  /** Nombre del esquema (y entidad). */
  name: string;
  /** Columna llave primaria. */
  pk: string;
  /** Ejemplo de la llave primaria en la documentación. */
  pkExample: number;
  /** Campos escribibles: tipo, descripción y restricciones. */
  properties: Prop;
  /** Campos obligatorios al CREAR. */
  required: string[];
  /** Ejemplo realista del registro completo. */
  example: Record<string, any>;
  /**
   * Subobjetos de llaves foráneas incrustados en la RESPUESTA (no en el input):
   * nombre del campo → esquema relacionado. El ejemplo del subobjeto se toma
   * del esquema referenciado en la segunda pasada de `buildEntitySchemas`.
   */
  relations?: Record<string, string>;
  /**
   * Campos CALCULADOS que solo aparecen en la respuesta (no se envían al
   * crear ni al actualizar). Ej.: `roles` de un usuario, resuelto por la API
   * desde `roles_usuarios`.
   */
  computados?: Prop;
  /**
   * Entidad de SOLO LECTURA (p. ej. la bitácora `audit_logs`, que escribe el
   * núcleo y no expone POST/PUT/DELETE): no se genera el esquema `XxxInput`,
   * porque ningún endpoint acepta ese payload.
   */
  soloLectura?: boolean;
}

const id = (description = 'Identificador único del registro'): Prop => ({
  type: 'integer',
  readOnly: true,
  example: 1,
  description,
});

const ts = (description: string): Prop => ({
  type: 'string',
  format: 'date-time',
  readOnly: true,
  example: '2026-03-04T15:30:00.000Z',
  description,
});

const estadoField: Prop = {
  type: 'string',
  enum: ['activo', 'inactivo'],
  default: 'activo',
  description: 'Estado lógico: la API nunca borra datos de forma física por accidente.',
};

const ref = (schema: string): Prop => ({ type: 'integer', description: `FK → ${schema}`, example: 1 });

const definitions: EntityDef[] = [
  // ── Identidad ────────────────────────────────────────────────────────────
  {
    name: 'Empresa',
    pk: 'empresa_id',
    pkExample: 1,
    properties: {
      razon_social: { type: 'string', maxLength: 120, example: 'IMVOLT Desarrollos S.A.', description: 'Razón social de la empresa' },
      ruc: { type: 'string', pattern: '^\\d{13}$', example: '1792345678001', description: 'RUC (13 dígitos)' },
    },
    required: ['razon_social', 'ruc'],
    example: { empresa_id: 1, razon_social: 'IMVOLT Desarrollos S.A.', ruc: '1792345678001', estado: 'activo', creado_en: '2026-01-12T14:05:00.000Z', actualizado_en: '2026-03-04T15:30:00.000Z' },
  },
  {
    name: 'Usuario',
    pk: 'usuario_id',
    pkExample: 7,
    properties: {
      nombre: { type: 'string', maxLength: 120, example: 'Andrea Salazar', description: 'Nombre completo del usuario' },
      email: { type: 'string', format: 'email', example: 'andrea.salazar@imvolt.ec', description: 'Correo de acceso (único por usuario)' },
      telefono: { type: 'string', maxLength: 20, nullable: true, example: '+593987654321', description: 'Teléfono / WhatsApp' },
      empresa_id: ref('Empresa'),
      contrasenia_temporal_hasta: { type: 'string', format: 'date-time', nullable: true, example: '2026-03-11T00:00:00.000Z', description: 'Vigencia de la contraseña temporal' },
      estado: { type: 'string', enum: ['activo', 'inactivo'], default: 'activo', example: 'activo', description: 'Baja lógica del miembro: `inactivo` revoca el acceso (la sesión responde 403)' },
    },
    required: ['nombre', 'email', 'empresa_id'],
    example: { usuario_id: 7, nombre: 'Andrea Salazar', email: 'andrea.salazar@imvolt.ec', telefono: '+593987654321', empresa_id: 1, contrasenia_temporal_hasta: null, roles: ['marketing'], estado: 'activo', creado_en: '2026-02-02T16:20:00.000Z', actualizado_en: '2026-03-01T09:10:00.000Z' },
    relations: { empresa: 'Empresa' },
    // Membresía resuelta por la API desde `roles_usuarios → roles` (solo lectura).
    computados: { roles: { type: 'array', items: { type: 'string' }, readOnly: true, example: ['marketing'], description: 'Nombres de los roles activos del miembro (catálogo §13)' } },
  },
  {
    name: 'Rol',
    pk: 'rol_id',
    pkExample: 2,
    properties: { nombre: { type: 'string', maxLength: 30, example: 'marketing', description: 'Nombre del rol' } },
    required: ['nombre'],
    example: { rol_id: 2, nombre: 'marketing', estado: 'activo', creado_en: '2026-01-12T14:06:00.000Z', actualizado_en: '2026-01-12T14:06:00.000Z' },
  },
  {
    name: 'Permiso',
    pk: 'permiso_id',
    pkExample: 5,
    properties: { nombre: { type: 'string', maxLength: 60, example: 'publicar_campanas', description: 'Nombre del permiso' } },
    required: ['nombre'],
    example: { permiso_id: 5, nombre: 'publicar_campanas', estado: 'activo', creado_en: '2026-01-12T14:06:00.000Z', actualizado_en: '2026-01-12T14:06:00.000Z' },
  },
  {
    name: 'UsuarioRol',
    pk: 'usuario_rol_id',
    pkExample: 3,
    properties: {
      usuario_id: ref('Usuario'),
      rol_id: ref('Rol'),
      estado: { type: 'string', enum: ['activo', 'inactivo'], default: 'activo', example: 'activo', description: 'Revocación lógica del rol: `inactivo` deja el vínculo sin efecto sin borrarlo' },
    },
    required: ['usuario_id', 'rol_id'],
    example: { usuario_rol_id: 3, usuario_id: 7, rol_id: 2, estado: 'activo', creado_en: '2026-02-02T16:21:00.000Z', actualizado_en: '2026-02-02T16:21:00.000Z' },
    relations: { usuario: 'Usuario', rol: 'Rol' },
  },
  {
    name: 'RolPermiso',
    pk: 'permiso_rol_id',
    pkExample: 11,
    properties: { rol_id: ref('Rol'), permiso_id: ref('Permiso') },
    required: ['rol_id', 'permiso_id'],
    example: { permiso_rol_id: 11, rol_id: 2, permiso_id: 5, estado: 'activo', creado_en: '2026-01-12T14:07:00.000Z', actualizado_en: '2026-01-12T14:07:00.000Z' },
    relations: { rol: 'Rol', permiso: 'Permiso' },
  },
  {
    name: 'HitoLanzamiento',
    pk: 'hito_lanzamiento_id',
    pkExample: 1,
    properties: {
      nombre: { type: 'string', maxLength: 60, example: 'Fotografía profesional', description: 'Nombre del hito' },
      descripcion: { type: 'string', maxLength: 500, example: 'Sesión autorizada de fotos originales del inmueble', description: 'Qué implica este hito' },
      orden: { type: 'integer', example: 1, description: 'Posición en el checklist de lanzamiento' },
      obligatorio: { type: 'boolean', example: true, description: 'Si debe completarse antes de publicar' },
    },
    required: ['nombre', 'descripcion', 'orden', 'obligatorio'],
    example: { hito_lanzamiento_id: 1, nombre: 'Fotografía profesional', descripcion: 'Sesión autorizada de fotos originales del inmueble', orden: 1, obligatorio: true, estado: 'activo', creado_en: '2026-01-12T14:08:00.000Z', actualizado_en: '2026-01-12T14:08:00.000Z' },
  },
  {
    name: 'EmpresaHito',
    pk: 'empresa_hito_id',
    pkExample: 4,
    properties: {
      empresa_id: ref('Empresa'),
      hito_lanzamiento_id: ref('HitoLanzamiento'),
      observaciones: { type: 'string', maxLength: 1000, example: 'Fotos entregadas el 12/03; faltan los planos aprobados.', description: 'Avance, evidencias o bloqueos' },
    },
    required: ['empresa_id', 'hito_lanzamiento_id', 'observaciones'],
    example: { empresa_hito_id: 4, empresa_id: 1, hito_lanzamiento_id: 1, observaciones: 'Fotos entregadas el 12/03; faltan los planos aprobados.', estado: 'activo', creado_en: '2026-03-04T15:30:00.000Z', actualizado_en: '2026-03-04T15:30:00.000Z' },
    relations: { empresa: 'Empresa', hito_lanzamiento: 'HitoLanzamiento' },
  },
  {
    name: 'ConfiguracionIntegracion',
    pk: 'configuracion_integracion_id',
    pkExample: 2,
    properties: {
      url_base: { type: 'string', format: 'uri', maxLength: 200, example: 'https://graph.facebook.com/v21.0', description: 'URL base del proveedor' },
      api_key: { type: 'string', writeOnly: true, maxLength: 200, example: 'sk-imvolt-9f3c…', description: 'Clave privada: se guarda cifrada y NUNCA se devuelve en las respuestas' },
      entorno: { type: 'string', maxLength: 20, example: 'produccion', description: 'Entorno de la integración (sandbox / produccion)' },
      api_id: { type: 'string', maxLength: 100, nullable: true, example: '1029384756', description: 'ID de la aplicación del proveedor' },
      app_secret: { type: 'string', maxLength: 200, writeOnly: true, nullable: true, example: '••••', description: 'Secreto de aplicación (solo escritura)' },
      access_token: { type: 'string', maxLength: 500, writeOnly: true, nullable: true, example: '••••', description: 'Token de acceso vigente (solo escritura)' },
    },
    required: ['url_base', 'api_key', 'entorno'],
    example: { configuracion_integracion_id: 2, url_base: 'https://graph.facebook.com/v21.0', api_key: '••••', entorno: 'produccion', api_id: '1029384756', app_secret: '••••', access_token: '••••', estado: 'activo', creado_en: '2026-02-18T11:00:00.000Z', actualizado_en: '2026-03-02T10:15:00.000Z' },
  },
  {
    // Catálogo de proveedores (tabla `integraciones`): sin CRUD propio, pero
    // se documenta porque `empresas_integraciones` lo incrusta como subobjeto.
    name: 'Integracion',
    pk: 'integracion_id',
    pkExample: 1,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: 'Meta Ads', description: 'Nombre del proveedor integrable' },
      proveedor: { type: 'string', maxLength: 50, nullable: true, example: 'Meta', description: 'Empresa proveedora' },
      descripcion: { type: 'string', nullable: true, example: 'Publicación de campañas en Facebook e Instagram', description: 'Qué permite hacer la integración' },
      activa: { type: 'boolean', default: true, example: true, description: 'Si el proveedor está habilitado para nuevas vinculaciones' },
    },
    required: ['nombre'],
    example: { integracion_id: 1, nombre: 'Meta Ads', proveedor: 'Meta', descripcion: 'Publicación de campañas en Facebook e Instagram', activa: true, estado: 'activo', creado_en: '2026-01-12T14:09:00.000Z', actualizado_en: '2026-01-12T14:09:00.000Z' },
  },
  {
    name: 'EmpresaIntegracion',
    pk: 'empresa_integracion_id',
    pkExample: 6,
    properties: {
      empresa_id: ref('Empresa'),
      integracion_id: ref('Integracion'),
      configuracion_integracion_id: ref('ConfiguracionIntegracion'),
      referencia_credencial: { type: 'string', maxLength: 500, example: 'Meta Ads — cuenta principal IMVOLT', description: 'Alias humano de la credencial utilizada' },
    },
    required: ['empresa_id', 'integracion_id', 'configuracion_integracion_id', 'referencia_credencial'],
    example: { empresa_integracion_id: 6, empresa_id: 1, integracion_id: 1, configuracion_integracion_id: 2, referencia_credencial: 'Meta Ads — cuenta principal IMVOLT', estado: 'activo', creado_en: '2026-02-18T11:05:00.000Z', actualizado_en: '2026-02-18T11:05:00.000Z' },
    relations: { empresa: 'Empresa', integracion: 'Integracion', configuracion_integracion: 'ConfiguracionIntegracion' },
  },

  // ── Propiedades ──────────────────────────────────────────────────────────
  {
    name: 'TipoPropiedad',
    pk: 'tipo_propiedad_id',
    pkExample: 1,
    properties: { nombre: { type: 'string', maxLength: 30, example: 'Lote', description: 'Nombre del tipo de inmueble' } },
    required: ['nombre'],
    example: { tipo_propiedad_id: 1, nombre: 'Lote', estado: 'activo', creado_en: '2026-01-12T14:10:00.000Z', actualizado_en: '2026-01-12T14:10:00.000Z' },
  },
  {
    name: 'Propiedad',
    pk: 'propiedad_id',
    pkExample: 3,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: 'Urbanización Aurora', description: 'Nombre comercial del inmueble' },
      ubicacion: { type: 'string', maxLength: 500, example: 'Vía a Machala km 4, Machala, Ecuador', description: 'Dirección o referencia de ubicación' },
      precio: { type: 'number', format: 'double', example: 18900, description: 'Precio de referencia' },
      disponibilidad: { type: 'string', enum: ['disponible', 'reservada', 'vendida', 'no_disponible'], default: 'disponible', example: 'disponible', description: 'Estado comercial del inmueble' },
      descripcion: { type: 'string', maxLength: 2000, example: 'Lotes urbanizados, acceso vial y planes de pago sujetos a verificación.', description: 'Descripción verificable para publicaciones' },
      empresa_id: ref('Empresa'),
      tipo_propiedad_id: ref('TipoPropiedad'),
    },
    required: ['nombre', 'ubicacion', 'precio', 'disponibilidad', 'descripcion', 'empresa_id', 'tipo_propiedad_id'],
    example: { propiedad_id: 3, nombre: 'Urbanización Aurora', ubicacion: 'Vía a Machala km 4, Machala, Ecuador', precio: 18900, disponibilidad: 'disponible', descripcion: 'Lotes urbanizados, acceso vial y planes de pago sujetos a verificación.', empresa_id: 1, tipo_propiedad_id: 1, estado: 'activo', creado_en: '2026-02-20T13:45:00.000Z', actualizado_en: '2026-03-05T08:25:00.000Z' },
    relations: { empresa: 'Empresa', tipo_propiedad: 'TipoPropiedad' },
  },

  // ── Creative ─────────────────────────────────────────────────────────────
  {
    name: 'TipoPlantilla',
    pk: 'tipo_plantilla_id',
    pkExample: 1,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: 'terrenos', description: 'Categoría de la plantilla' },
      descripcion: { type: 'string', maxLength: 500, example: 'Plantillas para lotes, terrenos y lotizaciones', description: 'Qué representa la categoría' },
    },
    required: ['nombre', 'descripcion'],
    example: { tipo_plantilla_id: 1, nombre: 'terrenos', descripcion: 'Plantillas para lotes, terrenos y lotizaciones', estado: 'activo', creado_en: '2026-01-12T14:12:00.000Z', actualizado_en: '2026-01-12T14:12:00.000Z' },
  },
  {
    name: 'Plantilla',
    pk: 'plantilla_id',
    pkExample: 2,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: 'Vuelo aéreo cinematográfico', description: 'Nombre de la plantilla creativa' },
      descripcion: { type: 'string', maxLength: 500, nullable: true, example: 'Introducción visual de una lotización desde la altura.', description: 'Qué produce la plantilla' },
      url_logo: { type: 'string', format: 'uri', maxLength: 200, nullable: true, example: 'https://imvolt.ec/logos/imvolt-horizontal.png', description: 'Logo aplicado a la pieza' },
      tipo_plantilla_id: ref('TipoPlantilla'),
    },
    required: ['nombre', 'tipo_plantilla_id'],
    example: { plantilla_id: 2, nombre: 'Vuelo aéreo cinematográfico', descripcion: 'Introducción visual de una lotización desde la altura.', url_logo: 'https://imvolt.ec/logos/imvolt-horizontal.png', tipo_plantilla_id: 1, estado: 'activo', creado_en: '2026-01-20T10:00:00.000Z', actualizado_en: '2026-02-28T17:40:00.000Z' },
    relations: { tipo_plantilla: 'TipoPlantilla' },
  },
  {
    name: 'Formato',
    pk: 'formato_id',
    pkExample: 1,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: '9:16 Reels', description: 'Nombre del formato de salida' },
      descripcion: { type: 'string', maxLength: 500, nullable: true, example: 'Vertical para Reels, TikTok y Stories', description: 'Uso recomendado' },
    },
    required: ['nombre'],
    example: { formato_id: 1, nombre: '9:16 Reels', descripcion: 'Vertical para Reels, TikTok y Stories', estado: 'activo', creado_en: '2026-01-12T14:13:00.000Z', actualizado_en: '2026-01-12T14:13:00.000Z' },
  },
  {
    name: 'EnfoqueComercial',
    pk: 'enfoque_comercial_id',
    pkExample: 2,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: 'Inversión', description: 'Ángulo de venta del anuncio' },
      descripcion: { type: 'string', maxLength: 500, nullable: true, example: 'Plusvalía, ubicación y retorno verificable', description: 'Cuándo usar el enfoque' },
    },
    required: ['nombre'],
    example: { enfoque_comercial_id: 2, nombre: 'Inversión', descripcion: 'Plusvalía, ubicación y retorno verificable', estado: 'activo', creado_en: '2026-01-12T14:14:00.000Z', actualizado_en: '2026-01-12T14:14:00.000Z' },
  },
  {
    name: 'ContenidoIa',
    pk: 'contenido_ia_id',
    pkExample: 9,
    properties: {
      propiedad_id: ref('Propiedad'),
      plantilla_id: ref('Plantilla'),
      formato_id: ref('Formato'),
      duracion: { type: 'string', maxLength: 20, example: '8 s', description: 'Duración solicitada (vacío para imagen)' },
      enfoque_comercial_id: ref('EnfoqueComercial'),
      url_imagen_referencia: { type: 'string', format: 'uri', maxLength: 500, nullable: true, example: 'https://imvolt.ec/media/aurora-fachada-original.jpg', description: 'Fotografía original que la IA debe preservar' },
    },
    required: ['propiedad_id', 'plantilla_id', 'formato_id', 'duracion', 'enfoque_comercial_id'],
    example: { contenido_ia_id: 9, propiedad_id: 3, plantilla_id: 2, formato_id: 1, duracion: '8 s', enfoque_comercial_id: 2, url_imagen_referencia: 'https://imvolt.ec/media/aurora-fachada-original.jpg', estado: 'activo', creado_en: '2026-03-06T09:15:00.000Z', actualizado_en: '2026-03-06T09:15:00.000Z' },
    relations: { propiedad: 'Propiedad', plantilla: 'Plantilla', formato: 'Formato', enfoque_comercial: 'EnfoqueComercial' },
  },

  // ── Publicidad ───────────────────────────────────────────────────────────
  {
    name: 'ObjetivoPublicidad',
    pk: 'objetivo_publicidad_id',
    pkExample: 1,
    properties: { nombre: { type: 'string', maxLength: 30, example: 'Mensajes', description: 'Objetivo de la campaña' } },
    required: ['nombre'],
    example: { objetivo_publicidad_id: 1, nombre: 'Mensajes', estado: 'activo', creado_en: '2026-01-12T14:15:00.000Z', actualizado_en: '2026-01-12T14:15:00.000Z' },
  },
  {
    name: 'CampaniaPublicitaria',
    pk: 'campania_publicitaria_id',
    pkExample: 5,
    properties: {
      propiedad_id: ref('Propiedad'),
      objetivo_publicidad_id: ref('ObjetivoPublicidad'),
      presupuesto_diario: { type: 'number', format: 'double', example: 15, description: 'Presupuesto diario máximo' },
      duracion_dias: { type: 'number', format: 'double', example: 30, description: 'Duración planificada en días' },
      zona_referencia: { type: 'string', maxLength: 50, example: 'Machala y 20 km alrededor', description: 'Geocercas o zona de segmentación' },
      copy_anuncio: { type: 'string', maxLength: 500, example: 'Lotes urbanizados en Urbanización Aurora, a 15 minutos del centro de Machala. Agenda tu visita.', description: 'Texto del anuncio sin promesas ni precios sin verificar' },
    },
    required: ['propiedad_id', 'objetivo_publicidad_id', 'presupuesto_diario', 'duracion_dias', 'zona_referencia', 'copy_anuncio'],
    example: { campania_publicitaria_id: 5, propiedad_id: 3, objetivo_publicidad_id: 1, presupuesto_diario: 15, duracion_dias: 30, zona_referencia: 'Machala y 20 km alrededor', copy_anuncio: 'Lotes urbanizados en Urbanización Aurora, a 15 minutos del centro de Machala. Agenda tu visita.', estado: 'activo', creado_en: '2026-03-06T10:30:00.000Z', actualizado_en: '2026-03-06T10:30:00.000Z' },
    relations: { propiedad: 'Propiedad', objetivo_publicidad: 'ObjetivoPublicidad' },
  },

  // ── Leads ────────────────────────────────────────────────────────────────
  {
    name: 'Contacto',
    pk: 'contacto_id',
    pkExample: 42,
    properties: {
      nombres: { type: 'string', maxLength: 30, example: 'María Fernanda', description: 'Nombres del contacto' },
      apellidos: { type: 'string', maxLength: 30, example: 'Rivas Ochoa', description: 'Apellidos del contacto' },
      correo: { type: 'string', format: 'email', example: 'maria.rivas@correo.com', description: 'Correo electrónico' },
      telefono: { type: 'string', maxLength: 13, example: '+593991234567', description: 'Teléfono / WhatsApp' },
      origen: { type: 'string', enum: ['meta_formulario', 'whatsapp', 'landing', 'manual', 'referido'], example: 'meta_formulario', description: 'Canal por el que llegó el contacto' },
      propiedad_id: { type: 'integer', nullable: true, description: 'FK → Propiedad (inmueble consultado)', example: 3 },
    },
    required: ['nombres', 'apellidos', 'correo', 'telefono', 'origen'],
    example: { contacto_id: 42, nombres: 'María Fernanda', apellidos: 'Rivas Ochoa', correo: 'maria.rivas@correo.com', telefono: '+593991234567', origen: 'meta_formulario', propiedad_id: 3, estado: 'activo', creado_en: '2026-03-06T11:02:00.000Z', actualizado_en: '2026-03-06T11:02:00.000Z' },
    relations: { propiedad: 'Propiedad' },
  },

  // ── Auditoría ────────────────────────────────────────────────────────────
  {
    // Bitácora de solo lectura: la escribe el núcleo en cada escritura y en el
    // registro/inicio de sesión. No tiene `Input` usable (sin operaciones de
    // escritura en el router), pero se documenta el esquema de respuesta.
    name: 'AuditLog',
    pk: 'audit_log_id',
    pkExample: 1284,
    properties: {
      accion: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'REGISTER', 'LOGIN', 'INVITE'], example: 'UPDATE', description: 'Acción registrada (`INVITE` = alta de miembro)' },
      tabla: { type: 'string', maxLength: 60, example: 'propiedades', description: 'Tabla afectada (o `sesion` para inicios de sesión)' },
      registro_id: { type: 'string', maxLength: 50, nullable: true, example: '3', description: 'Id del registro afectado' },
      auth_user_id: { type: 'string', maxLength: 36, nullable: true, example: '9f2c1a7e-4b3d-4e5f-8a9b-0c1d2e3f4a5b', description: 'UUID del usuario en Supabase Auth' },
      usuario_id: { type: 'integer', nullable: true, description: 'FK → Usuario (fila local; null si el usuario fue borrado)', example: 7 },
      empresa_id: { type: 'integer', nullable: true, description: 'FK → Empresa (tenant de la acción)', example: 1 },
      detalles: { type: 'object', nullable: true, example: { cambios: { precio: 19500 } }, description: 'Payload involucrado, con credenciales ya enmascaradas (`••••`)' },
    },
    required: ['accion', 'tabla'],
    example: { audit_log_id: 1284, accion: 'UPDATE', tabla: 'propiedades', registro_id: '3', auth_user_id: '9f2c1a7e-4b3d-4e5f-8a9b-0c1d2e3f4a5b', usuario_id: 7, empresa_id: 1, detalles: { cambios: { precio: 19500 } }, estado: 'activo', creado_en: '2026-03-06T12:04:31.000Z', actualizado_en: '2026-03-06T12:04:31.000Z' },
    relations: { usuario: 'Usuario', empresa: 'Empresa' },
    // Solo lectura: la bitácora la escribe el núcleo; no existe payload de entrada.
    soloLectura: true,
  },

  // ── Brand Kit (identidad de marca) ──────────────────────────────────────
  {
    name: 'BrandAsset',
    pk: 'brand_asset_id',
    pkExample: 1,
    properties: {
      nombre: { type: 'string', maxLength: 80, example: 'Logo horizontal principal', description: 'Nombre visible del archivo' },
      categoria: {
        type: 'string',
        enum: ['logo_horizontal', 'logo_isotipo', 'tipografia', 'imagen_referencia', 'plantilla_documento', 'otro'],
        example: 'logo_horizontal',
        description: 'Categoría: define qué tipos de archivo se aceptan al subir una versión',
      },
      descripcion: { type: 'string', maxLength: 500, nullable: true, example: 'Logo oficial para cabeceras y presentaciones', description: 'Para qué sirve este archivo en las piezas' },
      version_activa_id: { type: 'integer', nullable: true, description: 'FK → BrandAssetVersion (versión que se sirve al previsualizar y descargar)', example: 3 },
      empresa_id: ref('Empresa'),
    },
    required: ['nombre', 'categoria'],
    example: { brand_asset_id: 1, nombre: 'Logo horizontal principal', categoria: 'logo_horizontal', descripcion: 'Logo oficial para cabeceras y presentaciones', version_activa_id: 3, empresa_id: 1, estado: 'activo', creado_en: '2026-03-04T15:30:00.000Z', actualizado_en: '2026-03-04T16:10:00.000Z' },
    relations: { empresa: 'Empresa', version_activa: 'BrandAssetVersion' },
  },
  {
    // Las versiones no se crean por JSON: llegan en multipart a
    // `POST /brand-assets/{id}/versiones`. Solo se documenta la respuesta.
    name: 'BrandAssetVersion',
    pk: 'brand_asset_version_id',
    pkExample: 3,
    properties: {
      brand_asset_id: ref('BrandAsset'),
      numero: { type: 'integer', example: 3, description: 'Número correlativo de la versión (1 = v1)' },
      nombre_archivo: { type: 'string', maxLength: 200, example: 'logo-horizontal-v3.png', description: 'Nombre saneado del archivo dentro del bucket' },
      mime_type: { type: 'string', maxLength: 100, nullable: true, example: 'image/png', description: 'Tipo real detectado y validado contra la categoría' },
      tamano_bytes: { type: 'integer', nullable: true, example: 48213, description: 'Tamaño del blob (máximo 10 MB)' },
      nota: { type: 'string', maxLength: 500, nullable: true, example: 'Ajuste del isotipo para fondos oscuros.', description: 'Qué cambió en esta versión' },
      subido_por: { type: 'integer', nullable: true, description: 'FK → Usuario (quien subió la versión)', example: 7 },
      empresa_id: ref('Empresa'),
    },
    required: ['brand_asset_id', 'numero', 'nombre_archivo'],
    example: { brand_asset_version_id: 3, brand_asset_id: 1, numero: 3, nombre_archivo: 'logo-horizontal-v3.png', mime_type: 'image/png', tamano_bytes: 48213, nota: 'Ajuste del isotipo para fondos oscuros.', subido_por: 7, empresa_id: 1, estado: 'activo', creado_en: '2026-03-04T16:10:00.000Z', actualizado_en: '2026-03-04T16:10:00.000Z' },
    soloLectura: true,
  },
  {
    name: 'BrandColor',
    pk: 'brand_color_id',
    pkExample: 1,
    properties: {
      nombre: { type: 'string', maxLength: 50, example: 'Verde IMVOLT', description: 'Nombre del color en la paleta' },
      hex: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#008E47', description: 'Código hexadecimal (#RRGGBB)' },
      uso: { type: 'string', enum: ['principal', 'secundario', 'acento', 'fondo', 'texto'], default: 'principal', example: 'principal', description: 'Rol del color dentro de la identidad' },
      orden: { type: 'integer', default: 0, example: 0, description: 'Posición en la paleta' },
      empresa_id: ref('Empresa'),
    },
    required: ['nombre', 'hex'],
    example: { brand_color_id: 1, nombre: 'Verde IMVOLT', hex: '#008E47', uso: 'principal', orden: 0, empresa_id: 1, estado: 'activo', creado_en: '2026-03-04T15:30:00.000Z', actualizado_en: '2026-03-04T15:30:00.000Z' },
    relations: { empresa: 'Empresa' },
  },
];

/** Construye el par de esquemas (completo + input) de una entidad. */
function buildEntitySchemas(def: EntityDef): Prop {
  const { name, pk, pkExample, properties, required, example, relations, computados, soloLectura } = def;

  const { [pk]: _pk, estado: _estado, creado_en: _creado, actualizado_en: _actualizado, ...restoExample } = example;

  // El ejemplo del input nunca lleva los campos calculados (son de respuesta).
  const inputExample = Object.fromEntries(
    Object.entries(restoExample).filter(([key]) => !computados || !(key in computados))
  );

  // Subobjetos de llaves foráneas: solo en la respuesta, jamás en el input
  // (el payload siempre recibe los ids planos, p. ej. `empresa_id`).
  const relationProps = Object.fromEntries(
    Object.entries(relations ?? {}).map(([field, schema]) => [
      field,
      {
        allOf: [{ $ref: `#/components/schemas/${schema}` }],
        nullable: true,
        description: `Objeto relacionado (FK → ${schema}) incrustado en la respuesta`,
      },
    ])
  );

  const completo: Prop = {
    type: 'object',
    title: name,
    description: `Registro completo de ${name}`,
    properties: {
      [pk]: { ...id(`Identificador único de ${name}`), example: pkExample },
      ...properties,
      ...relationProps,
      // Campos calculados: solo en la respuesta, nunca en el payload de entrada.
      ...(computados ?? {}),
      estado: estadoField,
      creado_en: ts('Fecha de creación'),
      actualizado_en: ts('Última modificación'),
    },
    required: [pk, ...required],
    example,
  };

  // Entidades de solo lectura (p. ej. la bitácora) no tienen payload escribible.
  if (soloLectura) return { [name]: completo };

  return {
    [name]: completo,
    [`${name}Input`]: {
      type: 'object',
      title: `${name}Input`,
      description: `Payload para crear o actualizar ${name}. Al actualizar, los campos no enviados conservan su valor.`,
      properties,
      required,
      example: inputExample,
    },
  };
}

/** Esquemas OpenAPI de todas las entidades (completos e inputs). */
export const openapiSchemas: Prop = definitions.reduce<Prop>(
  (acc, def) => Object.assign(acc, buildEntitySchemas(def)),
  {}
);

// Segunda pasada: incrusta en cada ejemplo los subobjetos de sus relaciones,
// reutilizando el ejemplo real del esquema referenciado (sin duplicar datos).
definitions.forEach((def) => {
  Object.entries(def.relations ?? {}).forEach(([field, schema]) => {
    const relatedExample = openapiSchemas[schema]?.example;
    if (relatedExample && openapiSchemas[def.name]?.example) {
      openapiSchemas[def.name].example[field] = JSON.parse(JSON.stringify(relatedExample));
    }
  });
});

/** Nombres de esquema disponibles para `$ref`. */
export const schemaNames = definitions.map((def) => def.name);
