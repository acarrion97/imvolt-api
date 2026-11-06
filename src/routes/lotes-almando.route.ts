export { lotesAlMandoRouter } from '../controllers/lotes-almando.controller';

/**
 * @swagger
 * /api/v1/integraciones/lotes-al-mando/sync:
 *   post:
 *     summary: Sincroniza proyectos y lotes de Lotes al Mando
 *     description: >
 *       Consulta el inventario de la empresa autenticada en Lotes al Mando y
 *       crea o actualiza los proyectos y propiedades importados en IMVOLT.
 *       Los registros importados se identifican con un mapeo externo idempotente.
 *       Lotes sin precio válido o sin relación completa a un proyecto se omiten.
 *       Requiere propietario o administrador con permiso gestionar_integraciones.
 *     tags: [Identidad]
 *     responses:
 *       200:
 *         description: Inventario sincronizado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 proyectos_sincronizados: { type: integer, example: 3 }
 *                 lotes_sincronizados: { type: integer, example: 120 }
 *                 lotes_sin_precio_omitidos: { type: integer, example: 2 }
 *                 lotes_sin_proyecto_omitidos: { type: integer, example: 0 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       502: { description: Lotes al Mando no respondió correctamente }
 *       503: { description: La integración no está configurada o no se pudo persistir }
 */
