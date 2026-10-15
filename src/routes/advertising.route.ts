// routes/advertising.route.ts
// Rutas de IMVOLT Ads + Swagger (§10).

/**
 * @swagger
 * tags:
 *   name: Campañas
 *   description: Conexiones Meta, borradores, aprobaciones, publicación e insights
 */

/**
 * @swagger
 * /api/v1/conexiones:
 *   get:
 *     summary: Conexiones con cuentas publicitarias de Meta
 *     tags: [Campañas]
 *     responses:
 *       200: { description: Lista de conexiones }
 *   post:
 *     summary: Registra una conexión (OAuth de Meta en producción)
 *     tags: [Campañas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cuenta_publicitaria_id, nombre_cuenta]
 *             properties:
 *               cuenta_publicitaria_id: { type: string }
 *               nombre_cuenta: { type: string }
 *               estado: { type: string, enum: [conectada, pendiente, revocada] }
 *               permisos: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Conexión registrada }
 */

/**
 * @swagger
 * /api/v1/campaigns:
 *   get:
 *     summary: Campañas de la organización (filtros: ?estado=&objetivo=)
 *     tags: [Campañas]
 *     responses:
 *       200: { description: Lista de campañas }
 *   post:
 *     summary: Crea un borrador de campaña (RF-07)
 *     tags: [Campañas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, objetivo, destino, presupuesto_maximo]
 *             properties:
 *               nombre: { type: string }
 *               objetivo: { type: string, enum: [mensajes, formularios, visitas, trafico, branding] }
 *               destino: { type: string, enum: [whatsapp, formulario, landing] }
 *               presupuesto_maximo: { type: number }
 *               copy: { type: string }
 *               titulo: { type: string }
 *               cta: { type: string }
 *               creative_url: { type: string, format: uri }
 *     responses:
 *       201: { description: Borrador creado (estado local_draft) }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/validate:
 *   post:
 *     summary: Valida la campaña (compatibilidad, presupuesto, categoría vivienda)
 *     tags: [Campañas]
 *     parameters:
 *       - { in: path, name: id, schema: { type: string, format: uuid }, required: true }
 *     responses:
 *       200: { description: Campaña válida (pasa a validated) }
 *       400: { description: Errores de validación }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/approve:
 *   post:
 *     summary: Registra la aprobación autorizada (solo propietario/administrador)
 *     tags: [Campañas]
 *     parameters:
 *       - { in: path, name: id, schema: { type: string, format: uuid }, required: true }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [aprobada, rechazada] }
 *               comentario: { type: string }
 *     responses:
 *       200: { description: Aprobación registrada }
 *       409: { description: Estado no apto para aprobación }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/publish:
 *   post:
 *     summary: Publica en Meta dejando los recursos en PAUSED (RF-08)
 *     tags: [Campañas]
 *     parameters:
 *       - { in: path, name: id, schema: { type: string, format: uuid }, required: true }
 *     responses:
 *       200: { description: Recursos creados en Meta en estado pausado }
 *       409: { description: Requiere aprobación previa }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/insights:
 *   get:
 *     summary: Indicadores consolidados: gasto, impresiones, clics, leads, CPL y CTR
 *     tags: [Campañas]
 *     parameters:
 *       - { in: path, name: id, schema: { type: string, format: uuid }, required: true }
 *     responses:
 *       200: { description: Insights del snapshot más reciente }
 */

export { conexionRouter, campanaRouter } from '../controllers/advertising.controller';
