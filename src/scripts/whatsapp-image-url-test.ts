// scripts/whatsapp-image-url-test.ts
// Envía una imagen a WhatsApp usando SOLO una URL HTTPS pública (sin subir el
// archivo). Es la variante `image.link` de Cloud API: Meta descarga la imagen
// desde esa URL y la entrega al destinatario.
//
// Uso (desde la carpeta `api`):
//
//   npm run whatsapp:image-url
//   npm run whatsapp:image-url -- --url=https://.../anuncio.jpg
//   npm run whatsapp:image-url -- --url=https://.../anuncio.jpg --caption="Texto"
//   npm run whatsapp:image-url -- --url=https://.../anuncio.jpg --template
//   npm run whatsapp:image-url -- --to=593996349939
//
// Variables opcionales:
//   WHATSAPP_TEST_IMAGE_URL  URL por defecto si no se pasa --url
//   ANUNCIO_CAPTION          copy por defecto
//   SEND_TEMPLATE=1          envía primero la plantilla aprobada
//
// La URL debe ser pública: Meta no puede descargar localhost, 127.0.0.1 ni
// direcciones de red privada. Tampoco sirve un enlace firmado ya vencido.

import 'dotenv/config';
import { config } from '../config/global';
import {
  enviarImagen,
  enviarPlantilla,
  estadoWhatsApp,
  normalizarDestino,
} from '../services/whatsapp.service';

/** Imagen pública de ejemplo (foto inmobiliaria) por si no se indica otra. */
const URL_POR_DEFECTO =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80';

const CAPTION_POR_DEFECTO = [
  '🏡 [URL] Anuncio inmobiliario IMVOLT',
  'Esta imagen se envió indicando solo su enlace HTTPS.',
  'Escríbenos por WhatsApp para agendar una visita.',
  '#IMVOLT #Inmobiliaria',
].join('\n');

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

/**
 * Comprueba que Meta podrá descargar la imagen. Es solo informativo: si el
 * host rechaza HEAD se continúa igualmente y el error real lo dará WhatsApp.
 */
async function verificarUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('La URL de la imagen no es válida.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('WhatsApp exige que la URL de la imagen sea HTTPS.');
  }
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/i.test(parsed.hostname)) {
    throw new Error(
      'La URL apunta a una dirección local/privada; Meta no puede descargarla. Usa un host público.',
    );
  }

  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const tipo = response.headers.get('content-type') ?? 'desconocido';
    const bytes = Number(response.headers.get('content-length') ?? 0);
    const peso = bytes ? `${(bytes / 1024).toFixed(0)} KB` : 'tamaño desconocido';
    console.log(`Preflight: HTTP ${response.status} · ${tipo} · ${peso}`);
    if (!response.ok) {
      console.warn('⚠️  La URL no respondió 200; WhatsApp podría rechazarla.');
    } else if (!/^image\/(png|jpe?g)/i.test(tipo)) {
      console.warn('⚠️  El content-type no parece PNG/JPEG; WhatsApp podría rechazarla.');
    } else if (bytes > 5 * 1024 * 1024) {
      console.warn('⚠️  La imagen supera 5 MB; WhatsApp la rechazará.');
    }
  } catch {
    console.warn('⚠️  No se pudo hacer el preflight (HEAD). Se intentará enviar igual.');
  }
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

  const to = normalizarDestino(
    args.get('to') ?? process.env.ANUNCIO_TO ?? status.recipient_default ?? '',
  );
  const url =
    args.get('url') ?? process.env.WHATSAPP_TEST_IMAGE_URL ?? URL_POR_DEFECTO;
  const caption =
    args.get('caption') ?? process.env.ANUNCIO_CAPTION ?? CAPTION_POR_DEFECTO;
  const sendTemplate = flag(args, 'template') || process.env.SEND_TEMPLATE === '1';

  console.log(`Destino WhatsApp: ${to}`);
  console.log(`Imagen por URL: ${url}`);
  await verificarUrl(url);

  if (sendTemplate) {
    const template = await enviarPlantilla({ to });
    console.log('Plantilla enviada:', JSON.stringify(template));
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const sent = await enviarImagen({ to, link: url, caption });
  console.log('Imagen (por URL) enviada:', JSON.stringify(sent, null, 2));

  const wamid = sent.messages?.[0]?.id;
  if (wamid) console.log(`\nwamid: ${wamid}`);
  console.log('\n✅ Prueba completada. Revisa WhatsApp en el número indicado.');
  console.log(`Graph: ${config.whatsappTest.graphVersion} · media por link (sin media_id).`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ La prueba falló:', message);
  if (error instanceof Error && 'details' in error) {
    console.error('Detalles:', JSON.stringify((error as { details?: unknown }).details, null, 2));
  }
  process.exitCode = 1;
});
