// routes/advertising.route.ts
// Routers del módulo Publicidad (IMVOLT Ads).
// Documentación OpenAPI generada desde `src/docs`.

export { campaniaPublicitariaRouter, objetivoPublicidadRouter } from '../controllers/advertising.controller';

/**
 * @swagger
 * /api/v1/campanias-publicitarias/{id}/publicar:
 *   post:
 *     summary: Publica la campaña en Meta (siempre en estado PAUSADO)
 *     description: >
 *       Crea la campaña en la cuenta de Meta Ads de la empresa con el SDK
 *       oficial: estado `PAUSED` y categoría especial `HOUSING`. **Nunca activa
 *       gasto**; el presupuesto y la segmentación se definen después en el
 *       conjunto de anuncios. Usa la integración "Meta Ads" activa de la
 *       empresa (`api_id` = cuenta publicitaria, `access_token`). Sin
 *       `META_APP_ID` opera en modo simulado. Requiere rol propietario,
 *       administrador o marketing con el permiso `gestionar_campanas`.
 *     tags: [Publicidad]
 *     parameters:
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
