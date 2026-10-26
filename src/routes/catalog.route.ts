// routes/catalog.route.ts
// Routers del módulo Catálogo (proyectos + media assets en bucket privado).
//
// El CRUD se documenta con la spec generada (`src/docs`); las rutas PROPIAS de
// storage de los medios (subida multipart, historial y descargas con URL
// firmada) se documentan a mano con @swagger, igual que las del Brand Kit.

export { proyectoRouter, mediaAssetRouter } from '../controllers/catalog.controller';

/**
 * @swagger
 * /api/v1/media-assets/{id}/versiones:
 *   get:
 *     summary: Lista el historial de versiones de un medio
 *     description: >
 *       Devuelve las versiones subidas al bucket privado `media-assets`, de la
 *       más reciente a la más antigua. Solo el medio de la empresa activa.
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del media asset
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Historial de versiones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/MediaAssetVersion' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     summary: Sube una nueva versión del medio (pasa a ser la activa)
 *     description: >
 *       Recibe `multipart/form-data` con el campo `archivo` y una `nota`
 *       opcional. Valida el **límite de 100 MB** y el **catálogo de tipos**
 *       según la categoría del medio; si pasa, sube el blob al bucket y
 *       actualiza `version_activa_id`.
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del media asset
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
 *                 description: "Máximo 100 MB. Tipos según categoría (png, jpeg, webp, svg, mp4, webm, pdf)."
 *               nota:
 *                 type: string
 *                 maxLength: 500
 *                 description: Qué cambia en esta versión
 *                 example: Render con la nueva paleta corporativa.
 *     responses:
 *       201:
 *         description: Versión creada y activada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MediaAssetVersion' }
 *       400:
 *         description: Archivo vacío o adjunto ausente (validación Joi / multer)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       413:
 *         description: El archivo supera el límite de 100 MB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { message: "El archivo supera el máximo de 100 MB." }
 *       415:
 *         description: Tipo de archivo no permitido para la categoría
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */

/**
 * @swagger
 * /api/v1/media-assets/{id}/descarga:
 *   get:
 *     summary: Devuelve una URL firmada de la versión activa
 *     description: >
 *       El bucket es privado: para ver o descargar el medio la API entrega una
 *       URL firmada que caduca en 300 segundos. Requiere que el medio
 *       pertenezca a la empresa del token.
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del media asset
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: URL firmada de corta duración
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MediaAssetDescarga' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404:
 *         description: Medio inexistente (o sin versiones para descargar)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */

/**
 * @swagger
 * /api/v1/media-assets/{id}/versiones/{vid}/descarga:
 *   get:
 *     summary: Devuelve una URL firmada de una versión puntual
 *     description: Igual que la descarga activa, pero para cualquier versión del historial.
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - name: vid
 *         in: path
 *         required: true
 *         description: Identificador de la versión
 *         schema: { type: integer, example: 2 }
 *     responses:
 *       200:
 *         description: URL firmada de corta duración
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MediaAssetDescarga' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @swagger
 * /api/v1/media-assets/{id}/versiones/{vid}/restaurar:
 *   post:
 *     summary: Restaura una versión antigua como activa
 *     description: Actualiza `version_activa_id` del medio y devuelve el medio actualizado.
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - name: vid
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 2 }
 *     responses:
 *       200:
 *         description: Medio con la versión restaurada como activa
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MediaAsset' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @swagger
 * /api/v1/media-assets/{id}/versiones/{vid}:
 *   delete:
 *     summary: Elimina una versión (fila + blob del bucket)
 *     description: >
 *       Si la versión eliminada era la activa, el medio queda apuntando a la
 *       versión más reciente restante (o a ninguna).
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - name: vid
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 2 }
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
 * /api/v1/media-assets/{id}:
 *   delete:
 *     summary: Elimina el medio y todas sus versiones
 *     description: Borra los blobs del bucket, el historial de versiones y el registro del medio.
 *     tags: [Catálogo]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Medio eliminado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Mensaje' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
