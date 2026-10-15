// routes/lead.route.ts
// Rutas de leads + Swagger (§11).

/**
 * @swagger
 * tags:
 *   name: Leads
 *   description: Prospectos captados por campañas
 */

/**
 * @swagger
 * /api/v1/leads:
 *   get:
 *     summary: Leads de la organización (filtros: ?estado=&fuente=&campaign_id=)
 *     tags: [Leads]
 *     responses:
 *       200: { description: Lista de leads }
 *   post:
 *     summary: Registra un lead captado (manual o por webhook)
 *     tags: [Leads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, fuente]
 *             properties:
 *               nombre: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               fuente: { type: string, enum: [meta_formulario, whatsapp, landing, manual, lotes_al_mando] }
 *               campaign_id: { type: string, format: uuid }
 *               property_id: { type: string, format: uuid }
 *               provider_lead_id: { type: string, description: ID externo para deduplicar }
 *     responses:
 *       201: { description: Lead registrado }
 */

export { leadRouter } from '../controllers/lead.controller';
