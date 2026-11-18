// services/whatsapp.service.ts
// Cliente mínimo de WhatsApp Cloud API para el número de PRUEBA.
//
// Operaciones:
//   • enviarPlantilla  → primer contacto (template aprobado, p. ej. jaspers_market_plain_text_v1)
//   • enviarTexto      → mensaje libre (solo dentro de la ventana de 24 h)
//   • subirMedia       → sube una imagen PNG/JPEG y devuelve media_id
//   • enviarImagen     → envía una imagen por media_id o por link HTTPS
//
// Reglas de Meta que este servicio respeta:
//   • `to` va en formato internacional, SOLO dígitos (sin +, sin espacios).
//   • Una imagen pesa como máximo 5 MB y debe ser image/png o image/jpeg.
//   • El caption admite hasta 1024 caracteres.
//   • Fuera de la ventana de 24 h, primero debe enviarse una plantilla aprobada.
//
// El token vive únicamente en el backend (`WHATSAPP_TOKEN_TEST`).

import { config } from '../config/global';
import { HttpError, ValidationError } from '../core/errors';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CAPTION_CHARS = 1024;
const MAX_TEXT_CHARS = 4096;
const REQUEST_TIMEOUT_MS = 30000;

type GraphPayload = Record<string, unknown>;

export interface WhatsAppSendResult {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
}

export interface WhatsAppMediaResult {
  id: string;
}

export interface WhatsAppTemplateOptions {
  to?: string;
  name?: string;
  language?: string;
  components?: unknown[];
}

export interface WhatsAppImageOptions {
  to?: string;
  mediaId?: string;
  link?: string;
  caption?: string;
}

export interface WhatsAppTextOptions {
  to?: string;
  body: string;
}

export function estadoWhatsApp() {
  return {
    enabled: config.whatsappTest.enabled,
    configured: Boolean(config.whatsappTest.phoneNumberId && config.whatsappTest.token),
    graph_version: config.whatsappTest.graphVersion,
    phone_number_id: config.whatsappTest.phoneNumberId || null,
    recipient_default: config.whatsappTest.recipient || null,
    template_default: config.whatsappTest.template,
    language_default: config.whatsappTest.language,
    token_configured: Boolean(config.whatsappTest.token),
  };
}

export function assertWhatsAppTestEnabled(): void {
  if (!config.whatsappTest.enabled) {
    throw new HttpError(
      503,
      'El servicio de prueba de WhatsApp está desactivado. Define WHATSAPP_TEST_ENABLED=true.',
    );
  }
  if (!config.whatsappTest.phoneNumberId || !config.whatsappTest.token) {
    throw new HttpError(
      503,
      'Falta configurar WHATSAPP_ID_TEST o WHATSAPP_TOKEN_TEST para enviar mensajes de prueba.',
    );
  }
}

/** Acepta +593 99 634 9939, 593-99-634-9939, etc. Devuelve solo dígitos. */
export function normalizarDestino(value?: string): string {
  const raw = (value ?? config.whatsappTest.recipient).trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new ValidationError(
      'El número de WhatsApp debe tener entre 8 y 15 dígitos en formato internacional (sin +).',
      [{ field: 'to', message: 'Ejemplo: 593996349939' }],
    );
  }
  return digits;
}

function sanitizeTemplateName(value?: string): string {
  const name = (value ?? config.whatsappTest.template).trim();
  if (!/^[a-z0-9_]{1,512}$/i.test(name)) {
    throw new ValidationError('El nombre de la plantilla de WhatsApp no es válido.', [
      { field: 'template', message: 'Usa solo letras, números y guiones bajos.' },
    ]);
  }
  return name;
}

function sanitizeLanguage(value?: string): string {
  const language = (value ?? config.whatsappTest.language).trim();
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(language)) {
    throw new ValidationError('El código de idioma de la plantilla no es válido.', [
      { field: 'language', message: 'Formato esperado: en_US, es_ES, es_EC…' },
    ]);
  }
  return language;
}

/**
 * Meta descarga la imagen desde sus servidores: un host local o privado nunca
 * será alcanzable. Se rechaza antes de llamar a la API para dar un error claro.
 */
function esHostPrivado(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1') {
    return true;
  }
  if (/^127\./.test(host) || /^0\./.test(host) || /^10\./.test(host)) return true;
  if (/^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function providerHint(code?: number, subcode?: number): string | undefined {
  switch (code) {
    case 190:
      return 'El token de WhatsApp expiró o no es válido. Genera uno nuevo en Meta → WhatsApp → API Setup.';
    case 131047:
      return 'La ventana de 24 h está cerrada. Envía primero una plantilla aprobada y espera la respuesta del usuario.';
    case 131026:
      return 'El número destinatario no está disponible en WhatsApp o no es válido.';
    case 132000:
    case 132001:
      return 'La plantilla no existe o no está aprobada en la cuenta de WhatsApp. Créala en WhatsApp Manager.';
    case 131056:
      return 'Se alcanzó el límite de mensajes por minuto del número de prueba.';
    case 100:
      return subcode === 33
        ? 'Meta no reconoce el número/plantilla para este token. Revisa WHATSAPP_ID_TEST y los permisos.'
        : 'Meta rechazó un parámetro. Revisa el cuerpo enviado.';
    default:
      return undefined;
  }
}

async function graphRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  assertWhatsAppTestEnabled();
  const base = `https://graph.facebook.com/${config.whatsappTest.graphVersion}`;
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.whatsappTest.token}`,
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de red';
    throw new HttpError(502, `No se pudo conectar con WhatsApp: ${message}`);
  }

  const text = await response.text();
  let payload: GraphPayload = {};
  try {
    payload = text ? (JSON.parse(text) as GraphPayload) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    const error = (payload.error ?? {}) as {
      message?: unknown;
      code?: unknown;
      error_subcode?: unknown;
      fbtrace_id?: unknown;
    };
    const code = typeof error.code === 'number' ? error.code : undefined;
    const subcode = typeof error.error_subcode === 'number' ? error.error_subcode : undefined;
    const message =
      typeof error.message === 'string' && error.message.trim()
        ? error.message.trim()
        : `WhatsApp respondió ${response.status}.`;
    const hint = providerHint(code, subcode);

    throw new HttpError(
      response.status >= 500 ? 502 : 400,
      `WhatsApp rechazó la solicitud: ${message}`,
      {
        code,
        subcode,
        fbtrace_id: typeof error.fbtrace_id === 'string' ? error.fbtrace_id : undefined,
        hint,
      },
    );
  }

  return payload as T;
}

/** Envía una plantilla aprobada (primer contacto / re-engagement). */
export async function enviarPlantilla(
  options: WhatsAppTemplateOptions = {},
): Promise<WhatsAppSendResult> {
  const to = normalizarDestino(options.to);
  const name = sanitizeTemplateName(options.name);
  const language = sanitizeLanguage(options.language);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: language },
      ...(Array.isArray(options.components) && options.components.length
        ? { components: options.components }
        : {}),
    },
  };

  return graphRequest<WhatsAppSendResult>(`/${config.whatsappTest.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Mensaje de texto libre (solo válido dentro de la ventana de 24 h). */
export async function enviarTexto(options: WhatsAppTextOptions): Promise<WhatsAppSendResult> {
  const to = normalizarDestino(options.to);
  const body = options.body?.trim() ?? '';
  if (!body) throw new ValidationError('El mensaje de texto no puede estar vacío.');
  if (body.length > MAX_TEXT_CHARS) {
    throw new ValidationError(`El texto no puede superar ${MAX_TEXT_CHARS} caracteres.`);
  }

  return graphRequest<WhatsAppSendResult>(`/${config.whatsappTest.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    }),
  });
}

/** Sube una imagen al endpoint de media de WhatsApp y devuelve su media_id. */
export async function subirMedia(input: {
  buffer: Buffer;
  mime: string;
  filename?: string;
}): Promise<string> {
  const mime = input.mime.toLowerCase();
  if (!['image/jpeg', 'image/png'].includes(mime)) {
    throw new ValidationError('WhatsApp solo acepta imágenes JPEG o PNG.', [
      { field: 'mime', message: `Recibido: ${input.mime}` },
    ]);
  }
  if (!input.buffer.length) throw new ValidationError('La imagen está vacía.');
  if (input.buffer.length > MAX_IMAGE_BYTES) {
    throw new ValidationError('La imagen supera el límite de 5 MB de WhatsApp.');
  }

  const extension = mime === 'image/jpeg' ? 'jpg' : 'png';
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  // Copia exacta del Buffer: evita enviar bytes sobrantes del pool de Node.
  form.append(
    'file',
    new Blob([Uint8Array.from(input.buffer)], { type: mime }),
    input.filename ?? `anuncio.${extension}`,
  );

  const result = await graphRequest<WhatsAppMediaResult>(
    `/${config.whatsappTest.phoneNumberId}/media`,
    { method: 'POST', body: form },
  );
  if (!result.id) throw new HttpError(502, 'WhatsApp no devolvió el ID del medio subido.');
  return result.id;
}

/** Envía una imagen por media_id (recomendado) o por link HTTPS público. */
export async function enviarImagen(options: WhatsAppImageOptions): Promise<WhatsAppSendResult> {
  const to = normalizarDestino(options.to);
  const caption = options.caption?.trim().slice(0, MAX_CAPTION_CHARS);
  if (!options.mediaId && !options.link) {
    throw new ValidationError('Indica mediaId o link de la imagen a enviar.');
  }
  if (options.link && !/^https:\/\/\S+$/i.test(options.link)) {
    throw new ValidationError('El link de la imagen debe ser una URL HTTPS pública.');
  }
  if (options.link && esHostPrivado(options.link)) {
    throw new ValidationError(
      'El link de la imagen apunta a un host local o privado; Meta no puede descargarlo.',
      [{ field: 'link', message: 'Usa un dominio público accesible desde Internet.' }],
    );
  }

  const image = options.mediaId
    ? { id: options.mediaId, ...(caption ? { caption } : {}) }
    : { link: options.link, ...(caption ? { caption } : {}) };

  return graphRequest<WhatsAppSendResult>(`/${config.whatsappTest.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image,
    }),
  });
}
