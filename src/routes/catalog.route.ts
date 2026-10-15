// routes/catalog.route.ts
// Rutas del catálogo inmobiliario + Swagger.

/**
 * @swagger
 * tags:
 *   name: Catálogo
 *   description: Proyectos, propiedades, medios y brand kit (multi-tenant)
 */

/**
 * @swagger
 * /api/v1/proyectos:
 *   get:
 *     summary: Lista los proyectos de la organización (filtros: ?nombre=&tipo=&estado=&limite=&pagina=)
 *     tags: [Catálogo]
 *     parameters:
 *       - { in: query, name: tipo, schema: { type: string, enum: [lotizacion, urbanizacion, edificio, proyecto_planos, individual] } }
 *       - { in: query, name: estado, schema: { type: string, enum: [activo, pausado, terminado] } }
 *     responses:
 *       200: { description: Lista de proyectos }
 *   post:
 *     summary: Crea un proyecto
 *     tags: [Catálogo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo]
 *             properties:
 *               nombre: { type: string }
 *               tipo: { type: string }
 *               descripcion: { type: string }
 *               ubicacion: { type: string }
 *               total_lotes: { type: integer }
 *     responses:
 *       201: { description: Proyecto creado }
 */

/**
 * @swagger
 * /api/v1/propiedades:
 *   get:
 *     summary: Lista las propiedades de la organización (RF-02)
 *     tags: [Catálogo]
 *     parameters:
 *       - { in: query, name: project_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: categoria, schema: { type: string, enum: [lote, casa, departamento, oficina, local, proyecto] } }
 *       - { in: query, name: estado, schema: { type: string, enum: [disponible, reservada, vendida, no_disponible] } }
 *     responses:
 *       200: { description: Lista de propiedades }
 *   post:
 *     summary: Crea la ficha de una propiedad
 *     tags: [Catálogo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, categoria]
 *             properties:
 *               nombre: { type: string }
 *               categoria: { type: string }
 *               precio: { type: number }
 *               ciudad: { type: string }
 *               tiene_render_conceptual: { type: boolean, description: Marca si la propiedad incluye renders conceptuales }
 *     responses:
 *       201: { description: Propiedad creada }
 */

/**
 * @swagger
 * /api/v1/media:
 *   get:
 *     summary: Medios autorizados (fotos originales, renders, videos, planos)
 *     tags: [Catálogo]
 *     parameters:
 *       - { in: query, name: property_id, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Lista de medios }
 *   post:
 *     summary: Registra un medio de una propiedad
 *     tags: [Catálogo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, nombre, url]
 *             properties:
 *               property_id: { type: string, format: uuid }
 *               tipo: { type: string, enum: [foto, render, video, plano, documento] }
 *               nombre: { type: string }
 *               url: { type: string, format: uri }
 *               es_referencia_original: { type: boolean, description: Fotografía con derechos de uso que la IA debe preservar }
 *     responses:
 *       201: { description: Medio registrado }
 */

/**
 * @swagger
 * /api/v1/brand-kits:
 *   get:
 *     summary: Brand kits de la organización (RF-03)
 *     tags: [Catálogo]
 *     responses:
 *       200: { description: Lista de brand kits }
 *   post:
 *     summary: Crea un brand kit
 *     tags: [Catálogo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               logo_url: { type: string, format: uri }
 *               color_primario: { type: string }
 *               tipografia: { type: string }
 *     responses:
 *       201: { description: Brand kit creado }
 */

export { proyectoRouter, propiedadRouter, mediaRouter, brandKitRouter } from '../controllers/catalog.controller';
