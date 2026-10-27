// Routers del módulo Brand Kit (archivos de marca + colores de la paleta).
//
// El CRUD se documenta con la spec generada (`src/docs`); las rutas propias de
// storage se documentan a mano con @swagger.

export { brandAssetRouter, brandColorRouter } from '../controllers/brandkit.controller';

/**
 * @swagger
 * /api/v1/brand-assets/{id}/versiones:
 *   get:
 *     summary: Lista el historial de versiones de un archivo
 *     description: >
 *       Devuelve las versiones subidas al bucket privado `brand-kit`, de la
 *       más reciente a la más antigua. Solo el archivo de la empresa activa.
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del archivo de marca
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Historial de versiones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/BrandAssetVersion' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     summary: Sube una nueva versión del archivo (pasa a ser la activa)
 *     description: >
 *       Recibe `multipart/form-data` con el campo `archivo` y una `nota`
 *       opcional. Valida el límite de 10 MB y el tipo de archivo según la
 *       categoría; si pasa, sube el blob al bucket y activa la versión.
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del archivo de marca
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [archivo]
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *                 description: Máximo 10 MB; tipos permitidos según categoría.
 *               nota:
 *                 type: string
 *                 maxLength: 500
 *                 description: Qué cambia en esta versión
 *                 example: Ajuste del isotipo para fondos oscuros.
 *     responses:
 *       201:
 *         description: Versión creada y activada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BrandAssetVersion' }
 *       400:
 *         description: Archivo vacío o adjunto ausente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       413:
 *         description: El archivo supera el límite de 10 MB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       415:
 *         description: Tipo de archivo no permitido para la categoría
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */

/**
 * @swagger
 * /api/v1/brand-assets/{id}/descarga:
 *   get:
 *     summary: Devuelve una URL firmada de la versión activa
 *     description: >
 *       El bucket es privado: para ver o descargar el archivo la API entrega
 *       una URL firmada que caduca en 300 segundos. Requiere que el archivo
 *       pertenezca a la empresa del token.
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del archivo de marca
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: URL firmada de corta duración
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BrandAssetDescarga' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404:
 *         description: Archivo inexistente (o sin versiones para descargar)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */

/**
 * @swagger
 * /api/v1/brand-assets/{id}/versiones/{vid}/descarga:
 *   get:
 *     summary: Devuelve una URL firmada de una versión puntual
 *     description: Igual que la descarga activa, pero para cualquier versión del historial.
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - name: vid
 *         in: path
 *         required: true
 *         description: Identificador de la versión
 *         schema: { type: integer, example: 3 }
 *     responses:
 *       200:
 *         description: URL firmada de corta duración
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BrandAssetDescarga' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @swagger
 * /api/v1/brand-assets/{id}/versiones/{vid}/restaurar:
 *   post:
 *     summary: Restaura una versión antigua como activa
 *     description: Actualiza `version_activa_id` y devuelve el archivo actualizado.
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - name: vid
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 3 }
 *     responses:
 *       200:
 *         description: Archivo con la versión restaurada como activa
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BrandAsset' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @swagger
 * /api/v1/brand-assets/{id}/versiones/{vid}:
 *   delete:
 *     summary: Elimina una versión (fila + blob del bucket)
 *     description: >
 *       Si la versión eliminada era la activa, el archivo queda apuntando a la
 *       versión más reciente restante (o a ninguna).
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - name: vid
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 3 }
 *     responses:
 *       200:
 *         description: Versión eliminada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Mensaje' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @swagger
 * /api/v1/brand-assets/{id}:
 *   delete:
 *     summary: Elimina el archivo y todas sus versiones
 *     description: Borra los blobs del bucket, el historial y el registro del archivo.
 *     tags: [Brand Kit]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Archivo eliminado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Mensaje' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
