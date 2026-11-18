// scripts/whatsapp-ad-test.ts
// Prueba manual del flujo: imagen IA (OpenRouter) → WhatsApp.
//
// Uso (desde la carpeta `api`):
//
//   npm run whatsapp:test
//   npm run whatsapp:test -- --template            # primero envía la plantilla
//   npm run whatsapp:test -- --text                # además envía el copy como texto
//   npm run whatsapp:test -- --to=593996349939 --prompt="..." --caption="..."
//
// Variables opcionales:
//   ANUNCIO_PROMPT, ANUNCIO_CAPTION, ANUNCIO_ASPECT_RATIO
//   SEND_TEMPLATE=1, SEND_TEXT=1
//
// No imprime el token ni datos sensibles de la cuenta.

import 'dotenv/config';
import { config } from '../config/global';
import { generarImagenConOpenRouter } from '../services/openrouter-image.service';
import {
  enviarImagen,
  enviarPlantilla,
  enviarTexto,
  estadoWhatsApp,
  normalizarDestino,
  subirMedia,
} from '../services/whatsapp.service';

function parseArgs(): Map<string, string> {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args.set(key, rest.length ? rest.join('=') : '1');
  }
  return args;
}

function flag(args: Map<string, string>, name: string): boolean {
  return args.get(name) === '1' || args.get(name) === 'true';
}

async function main(): Promise<void> {
  const args = parseArgs();
  const status = estadoWhatsApp();

  if (!status.enabled) {
    throw new Error('WHATSAPP_TEST_ENABLED no es true. Actívalo en api/.env.');
  }
  if (!status.configured) {
    throw new Error('Faltan WHATSAPP_ID_TEST y WHATSAPP_TOKEN_TEST en api/.env.');
  }

  const to = normalizarDestino(args.get('to') ?? process.env.ANUNCIO_TO ?? status.recipient_default ?? '');
  const prompt =
    args.get('prompt') ??
    process.env.ANUNCIO_PROMPT ??
    [
      'Anuncio inmobiliario de demostración: apartamento moderno con sala luminosa,',
      'cocina integrada, grandes ventanales y vista urbana al atardecer.',
      'Fotografía arquitectónica profesional, luz natural cálida, composición limpia.',
      'Sin texto, sin logotipos, sin marcas de agua, sin personas identificables.',
    ].join(' ');
  const caption =
    args.get('caption') ??
    process.env.ANUNCIO_CAPTION ??
    [
      '🏡 [DEMO] Anuncio inmobiliario IMVOLT',
      'Descubre este espacio diseñado para disfrutar cada día.',
      'Escríbenos por WhatsApp para agendar una visita.',
      '#IMVOLT #Inmobiliaria',
    ].join('\n');
  const aspectRatio = args.get('ratio') ?? process.env.ANUNCIO_ASPECT_RATIO ?? '1:1';
  const sendTemplate = flag(args, 'template') || process.env.SEND_TEMPLATE === '1';
  const sendText = flag(args, 'text') || process.env.SEND_TEXT === '1';

  console.log(`Destino WhatsApp: ${to}`);
  console.log(`Modelo OpenRouter: ${config.openRouterImage.model}`);
  console.log(`Fallback local: ${config.openRouterImage.fallback ? 'sí' : 'no'}`);

  if (sendTemplate) {
    const template = await enviarPlantilla({ to });
    console.log('Plantilla enviada:', JSON.stringify(template));
    // Pequeña pausa para que WhatsApp procese la plantilla antes de la imagen.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (sendText) {
    const text = await enviarTexto({ to, body: caption });
    console.log('Texto enviado:', JSON.stringify(text));
  }

  const image = await generarImagenConOpenRouter({ prompt, aspectRatio });
  console.log('Imagen generada:', JSON.stringify({
    model: image.model,
    simulated: image.simulated,
    mime: image.mime,
    bytes: image.image.length,
    duration_ms: image.durationMs,
    estimated_cost_usd: image.estimatedCostUsd,
    warning: image.warning ?? null,
  }, null, 2));

  const mediaId = await subirMedia({
    buffer: image.image,
    mime: image.mime,
    filename: image.mime === 'image/jpeg' ? 'anuncio.jpg' : 'anuncio.png',
  });
  console.log('Media subida a WhatsApp:', mediaId);

  const sent = await enviarImagen({ to, mediaId, caption });
  console.log('Imagen enviada:', JSON.stringify(sent, null, 2));
  console.log('\n✅ Prueba completada. Revisa WhatsApp en el número indicado.');
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ La prueba falló:', message);
  if (error instanceof Error && 'details' in error) {
    console.error('Detalles:', JSON.stringify((error as { details?: unknown }).details, null, 2));
  }
  process.exitCode = 1;
});
