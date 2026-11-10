// routes/advertising.route.ts
// Routers del módulo Publicidad (IMVOLT Ads).
// Documentación OpenAPI generada desde `src/docs`.

export {
  campaignRouter,
  campaniaPublicitariaRouter,
  conexionRouter,
  objetivoPublicidadRouter
} from '../controllers/advertising.controller';

/**
 * @swagger
 * /api/v1/campaigns/reports/analytics:
 *   get:
 *     summary: Consulta métricas de campañas en Meta
 *     description: Requiere sesión y permiso ver_analitica. Rango inclusivo máximo de 90 días; limit entre 1 y 100. Meta puede revisar y actualizar Insights después de la consulta, por lo que no se garantiza tiempo real. actualizado_en es la hora de consulta, no la fecha de origen de eventos.
 *     tags: [Analítica]
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: fuente
 *         schema: { type: string, enum: [meta], default: meta }
 *       - in: query
 *         name: campania_id
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 25 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, minimum: 0, default: 0 }
 *     responses:
 *       200: { description: Métricas agregadas por campaña; CTR es clics/impresiones × 100 y CPL es gasto/leads. Si falta el dato o el denominador es cero, la métrica derivada es null. }
 *       403: { description: Falta el permiso ver_analitica }
 *       502: { description: Meta no entregó las métricas }
 */

/**
 * @swagger
 * /api/v1/campanias-publicitarias/{id}/publicar:
 *   post:
 *     summary: Publica la campaña en Meta (siempre en estado PAUSADO)
 *     description: >
 *       Crea la campaña en la cuenta de Meta Ads de la empresa con el SDK
 *       oficial: estado `PAUSED` y categoría especial `HOUSING`. **Nunca activa
 *       gasto**; el presupuesto y la segmentación se definen después en el
 *       conjunto de anuncios. Usa la conexión activa de Meta Ads de la empresa.
 *       Requiere aprobación explícita previa, un `Idempotency-Key` UUID v4 y rol propietario,
 *       administrador o marketing con el permiso `gestionar_campanas`.
 *     tags: [Publicidad]
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 5 }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               validar_solo:
 *                 type: boolean
 *                 default: false
 *                 description: Meta valida la petición sin crear la campaña
 *     responses:
 *       201:
 *         description: Campaña creada en Meta (pausada)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 campania_publicitaria_id: { type: integer, example: 5 }
 *                 meta_campaign_id: { type: string, example: "120210000000000000" }
 *                 meta_estado: { type: string, example: published_paused }
 *                 simulado: { type: boolean, example: false }
 *                 validado_solo: { type: boolean, example: false }
 *       200:
 *         description: Con `validar_solo`, la validación fue correcta y no se creó nada
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Sin rol o permiso `gestionar_campanas`
 *       404:
 *         description: La campaña no existe o es de otra empresa
 *       409:
 *         description: La campaña ya fue publicada o se está publicando
 *       502:
 *         description: Meta rechazó la petición (se devuelve su mensaje público)
 */

/**
 * @swagger
 * /api/v1/campaigns/strategist:
 *   post:
 *     summary: Genera estrategia y variantes A/B desde la ficha de propiedad
 *     tags: [Publicidad]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [property_id, objetivo]
 *             properties:
 *               property_id: { type: string }
 *               objetivo: { type: string, enum: [mensajes, formularios, visitas, trafico, branding] }
 *     responses:
 *       200: { description: Ángulos, copies, CTA, guiones y checklist editorial }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { description: La propiedad no existe o es de otra empresa }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/validate:
 *   post:
 *     summary: Valida un borrador local
 *     tags: [Publicidad]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Campaña validada }
 *       409: { description: Estado de campaña no válido }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/request-approval:
 *   post:
 *     summary: Envía una campaña validada a aprobación
 *     tags: [Publicidad]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Campaña pendiente de aprobación explícita }
 *       409: { description: La campaña no está validada }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/approve:
 *   post:
 *     summary: Aprueba explícitamente la campaña (propietario o administrador)
 *     tags: [Publicidad]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Campaña aprobada }
 *       403: { description: Requiere propietario o administrador }
 *       409: { description: La campaña no está pendiente de aprobación }
 */

/**
 * @swagger
 * /api/v1/campaigns/{id}/sync-status:
 *   post:
 *     summary: Sincroniza el estado de entrega leyendo Meta (no activa gasto)
 *     tags: [Publicidad]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Estado de entrega sincronizado }
 *       409: { description: La campaña no está publicada en Meta }
 *       502: { description: Meta no pudo confirmar el estado }
 */
