// routes/creative.route.ts
// Rutas del Estudio IA + Swagger (§07, §08, §09).

/**
 * @swagger
 * tags:
 *   name: Estudio IA
 *   description: Plantillas, modelos, generaciones de imagen/video y estratega
 */

/**
 * @swagger
 * /api/v1/plantillas:
 *   get:
 *     summary: Biblioteca de plantillas (del sistema + propias de la organización)
 *     tags: [Estudio IA]
 *     parameters:
 *       - { in: query, name: categoria, schema: { type: string, enum: [lotizaciones, casas, departamentos, proyecto_planos, publicidad_comercial, marca_inmobiliaria] } }
 *       - { in: query, name: objetivo, schema: { type: string, enum: [visitas, mensajes, formularios, branding] } }
 *     responses:
 *       200: { description: Lista de plantillas }
 */

/**
 * @swagger
 * /api/v1/modelos:
 *   get:
 *     summary: Modelos habilitados con compatibilidad y cotización vigente
 *     tags: [Estudio IA]
 *     responses:
 *       200: { description: Registro de modelos del proveedor }
 */

/**
 * @swagger
 * /api/v1/creative/generations:
 *   get:
 *     summary: Trabajos de generación de la organización (con outputs)
 *     tags: [Estudio IA]
 *     responses:
 *       200: { description: Lista de generaciones }
 *   post:
 *     summary: Cotiza, reserva créditos y crea un job de generación (RF-05, RF-06)
 *     tags: [Estudio IA]
 *     parameters:
 *       - { in: header, name: Idempotency-Key, schema: { type: string }, description: Evita cargos dobles por reintentos }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [model_id, prompt]
 *             properties:
 *               property_id: { type: string, format: uuid }
 *               template_id: { type: string, format: uuid }
 *               model_id: { type: string, format: uuid }
 *               modo: { type: string, enum: [facil, pro] }
 *               prompt: { type: string }
 *               parametros:
 *                 type: object
 *                 properties:
 *                   duration: { type: number }
 *                   ratio: { type: string }
 *                   resolution: { type: string }
 *                   image_url: { type: string, format: uri }
 *     responses:
 *       201: { description: Job creado y créditos reservados }
 *       402: { description: Créditos insuficientes }
 */

/**
 * @swagger
 * /api/v1/creative/generations/{id}:
 *   get:
 *     summary: Estado del job; concilia créditos cuando el proveedor termina
 *     tags: [Estudio IA]
 *     parameters:
 *       - { in: path, name: id, schema: { type: string, format: uuid }, required: true }
 *     responses:
 *       200: { description: Job con outputs }
 *       404: { description: No encontrado }
 */

/**
 * @swagger
 * /api/v1/creative/generations/{id}/cancel:
 *   post:
 *     summary: Cancela un job elegible y devuelve los créditos reservados
 *     tags: [Estudio IA]
 *     parameters:
 *       - { in: path, name: id, schema: { type: string, format: uuid }, required: true }
 *     responses:
 *       200: { description: Job cancelado }
 *       409: { description: Estado no elegible }
 */

/**
 * @swagger
 * /api/v1/strategist:
 *   post:
 *     summary: Estratega inmobiliario: ángulos, copies, guion y checklist editorial (§08)
 *     tags: [Estudio IA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [property_id]
 *             properties:
 *               property_id: { type: string, format: uuid }
 *               objetivo: { type: string, enum: [visitas, mensajes, formularios, branding] }
 *     responses:
 *       200: { description: Salida estructurada de la estrategia }
 */

export {
  plantillaRouter,
  modeloRouter,
  generacionRouter,
  estrategaRouter,
} from '../controllers/creative.controller';
