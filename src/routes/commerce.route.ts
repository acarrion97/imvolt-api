// routes/commerce.route.ts
// Rutas de comercio (planes, suscripciones, créditos) + Swagger.

/**
 * @swagger
 * tags:
 *   name: Comercio
 *   description: Planes SaaS, suscripciones y ledger de créditos
 */

/**
 * @swagger
 * /api/v1/planes:
 *   get:
 *     summary: Planes disponibles (Agent, Business, Developer)
 *     tags: [Comercio]
 *     responses:
 *       200: { description: Lista de planes }
 */

/**
 * @swagger
 * /api/v1/suscripciones:
 *   get:
 *     summary: Suscripciones de la organización activa
 *     tags: [Comercio]
 *     responses:
 *       200: { description: Lista de suscripciones }
 *   post:
 *     summary: Activa una suscripción para la organización
 *     tags: [Comercio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan_id]
 *             properties:
 *               plan_id: { type: string, format: uuid }
 *               fecha_inicio: { type: string, format: date }
 *               fecha_fin: { type: string, format: date }
 *     responses:
 *       201: { description: Suscripción creada }
 */

/**
 * @swagger
 * /api/v1/billing/wallet:
 *   get:
 *     summary: Wallet de créditos de la organización (saldo vigente)
 *     tags: [Comercio]
 *     responses:
 *       200: { description: Wallet }
 */

/**
 * @swagger
 * /api/v1/billing/transactions:
 *   get:
 *     summary: Movimientos del ledger de créditos (§14)
 *     tags: [Comercio]
 *     parameters:
 *       - { in: query, name: limite, schema: { type: integer }, description: Máximo de movimientos }
 *     responses:
 *       200: { description: Historial de movimientos }
 */

/**
 * @swagger
 * /api/v1/billing/recharge:
 *   post:
 *     summary: Registra una recarga de créditos (stub de pasarela)
 *     tags: [Comercio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto]
 *             properties:
 *               monto: { type: integer }
 *               idempotency_key: { type: string }
 *     responses:
 *       201: { description: Recarga registrada }
 */

export { planRouter, suscripcionRouter, billingRouter } from '../controllers/commerce.controller';
