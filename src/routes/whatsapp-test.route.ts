// routes/whatsapp-test.route.ts
// Servicio TEMPORAL de prueba de WhatsApp Cloud API + anuncios con OpenRouter.

export { whatsappTestRouter } from '../controllers/whatsapp-test.controller';

/**
 * @swagger
 * /api/v1/whatsapp/test/status:
 *   get:
 *     summary: Estado del servicio de prueba (sin secretos)
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Configuración enmascarada de WhatsApp y OpenRouter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 whatsapp:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean }
 *                     configured: { type: boolean }
 *                     graph_version: { type: string, example: v25.0 }
 *                     template_default: { type: string, example: jaspers_market_plain_text_v1 }
 *                     language_default: { type: string, example: en_US }
 *                     token_configured: { type: boolean }
 *                 openrouter_image:
 *                   type: object
 *                   properties:
 *                     configured: { type: boolean }
 *                     model: { type: string, example: google/gemini-3.1-flash-lite-image }
 *                     simulate: { type: boolean }
 *                     fallback: { type: boolean }
 */

/**
 * @swagger
 * /api/v1/whatsapp/test/template:
 *   post:
 *     summary: Envía una plantilla aprobada por WhatsApp (primer contacto)
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to: { type: string, example: "593996349939", description: "Solo dígitos, sin +" }
 *               template: { type: string, example: jaspers_market_plain_text_v1 }
 *               language: { type: string, example: en_US }
 *               components: { type: array, items: { type: object } }
 *     responses:
 *       200: { description: Plantilla aceptada por Meta }
 *       400: { description: Meta rechazó la plantilla o los parámetros }
 *       503: { description: Servicio de prueba desactivado o sin credenciales }
 */

/**
 * @swagger
 * /api/v1/whatsapp/test/text:
 *   post:
 *     summary: Envía un texto libre (ventana de 24 h)
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               to: { type: string, example: "593996349939" }
 *               message: { type: string, maxLength: 4096, example: "Hola, este es un mensaje de prueba de IMVOLT." }
 *     responses:
 *       200: { description: Mensaje aceptado por Meta }
 *       400: { description: Meta rechazó el mensaje (p. ej. ventana de 24 h cerrada) }
 */

/**
 * @swagger
 * /api/v1/whatsapp/test/image:
 *   post:
 *     summary: Envía una imagen generada, una URL o un output existente
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to: { type: string, example: "593996349939" }
 *               prompt: { type: string, description: "Si se envía, genera la imagen con OpenRouter" }
 *               image_url: { type: string, description: "URL HTTPS pública de la imagen" }
 *               generation_id: { type: integer, description: "ID de /api/v1/creative/generations" }
 *               image_base64: { type: string, description: "PNG/JPEG en base64 o data URL" }
 *               caption: { type: string, maxLength: 1024 }
 *               aspect_ratio: { type: string, example: "1:1" }
 *     responses:
 *       200: { description: Imagen aceptada por Meta }
 *       400: { description: Parámetros inválidos o rechazo de Meta }
 *       404: { description: La generación no existe o es de otra empresa }
 */

/**
 * @swagger
 * /api/v1/whatsapp/test/anuncio:
 *   post:
 *     summary: Genera un anuncio (copy + imagen IA) y lo envía por WhatsApp
 *     description: >
 *       Si se indica `propiedad_id`, usa exclusivamente los datos confirmados de
 *       la ficha para el copy y el prompt. La imagen se genera con OpenRouter
 *       (o con el PNG de marca si no hay saldo y el fallback está activo).
 *       Opcionalmente envía primero una plantilla aprobada (`enviar_plantilla`)
 *       y/o el copy como texto (`enviar_texto`).
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to: { type: string, example: "593996349939" }
 *               propiedad_id: { type: integer, example: 12 }
 *               prompt: { type: string, description: "Indicación creativa adicional" }
 *               caption: { type: string, maxLength: 1024, description: "Copy exacto; si se omite se construye desde la propiedad" }
 *               image_url: { type: string, description: "Si se indica, no se genera imagen" }
 *               generar_imagen: { type: boolean, default: true }
 *               enviar_plantilla: { type: boolean, default: false }
 *               enviar_texto: { type: boolean, default: false }
 *               template: { type: string, example: jaspers_market_plain_text_v1 }
 *               language: { type: string, example: en_US }
 *               aspect_ratio: { type: string, example: "1:1" }
 *     responses:
 *       200: { description: Anuncio generado y enviado }
 *       400: { description: Datos inválidos o rechazo de Meta }
 *       404: { description: La propiedad no existe o es de otra empresa }
 *       503: { description: Servicio de prueba desactivado o sin credenciales }
 */
