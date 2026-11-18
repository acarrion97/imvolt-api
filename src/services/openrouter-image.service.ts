// services/openrouter-image.service.ts
// Generación de imágenes con OpenRouter (modo TEMPORAL para pruebas).
//
// OpenRouter expone modelos multimodales que devuelven la imagen inline como
// data URL (`data:image/png;base64,...`). Este adaptador:
//
//   • llama a /api/v1/chat/completions con `modalities: ["image", "text"]`;
//   • normaliza la respuesta a un Buffer + MIME listo para storage/WhatsApp;
//   • si la clave no tiene saldo (OpenRouter exige USD 1.00 para imagen) o el
//     proveedor falla, puede devolver un PNG de marca generado localmente para
//     no bloquear las pruebas de WhatsApp (`OPENROUTER_IMAGE_FALLBACK=true`).
//
// La clave NUNCA sale del backend.

import { deflateSync } from 'zlib';
import { config } from '../config/global';

const MAX_PROMPT_CHARS = 4000;
/** Límite de WhatsApp para imágenes: 5 MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_ASPECT = '1:1';

export interface OpenRouterImageInput {
  prompt: string;
  aspectRatio?: string;
  model?: string;
  referenceImageUrl?: string;
}

export interface OpenRouterImageResult {
  image: Buffer;
  mime: string;
  model: string;
  prompt: string;
  durationMs: number;
  estimatedCostUsd: number | null;
  simulated: boolean;
  /** Texto que acompañó a la imagen (si el modelo lo devolvió). */
  text?: string;
  /** Motivo del fallback simulado, para mostrarlo en la respuesta de prueba. */
  warning?: string;
}

export class OpenRouterImageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenRouterImageError';
  }
}

// ── PNG de marca (fallback local, sin dependencias ni red) ──────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

/**
 * PNG 1080×1080 con el degradado de marca IMVOLT. Se usa cuando OpenRouter no
 * puede generar (sin saldo, sin clave, timeout) para que el flujo de WhatsApp
 * se pueda probar de extremo a extremo.
 */
export function crearPlaceholderPng(width = 1080, height = 1080): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const top = { r: 0x0f, g: 0x1f, b: 0x18 };
  const bottom = { r: 0x00, g: 0xd9, b: 0x4b };
  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filtro PNG "None"
    offset += 1;
    const ratio = height > 1 ? y / (height - 1) : 0;
    const r = Math.round(top.r + (bottom.r - top.r) * ratio);
    const g = Math.round(top.g + (bottom.g - top.g) * ratio);
    const b = Math.round(top.b + (bottom.b - top.b) * ratio);

    for (let x = 0; x < width; x += 1) {
      const border = x < 14 || x >= width - 14 || y < 14 || y >= height - 14;
      raw[offset] = border ? 0x00 : r;
      raw[offset + 1] = border ? 0xd9 : g;
      raw[offset + 2] = border ? 0x4b : b;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 2; // RGB truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function placeholderResult(
  prompt: string,
  model: string,
  startedAt: number,
  warning: string,
): OpenRouterImageResult {
  return {
    image: crearPlaceholderPng(),
    mime: 'image/png',
    model: model || 'placeholder/imvolt-brand',
    prompt,
    durationMs: Date.now() - startedAt,
    estimatedCostUsd: 0,
    simulated: true,
    warning,
  };
}

// ── Respuesta del proveedor ────────────────────────────────────────────────
function imageCandidates(payload: unknown): string[] {
  const message = (payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
        images?: Array<{
          image_url?: { url?: unknown };
          url?: unknown;
        } | string>;
      };
    }>;
  })?.choices?.[0]?.message;

  const candidates: string[] = [];
  if (Array.isArray(message?.images)) {
    for (const item of message.images) {
      if (typeof item === 'string') {
        candidates.push(item);
      } else {
        const url = item?.image_url?.url ?? item?.url;
        if (typeof url === 'string') candidates.push(url);
      }
    }
  }
  if (Array.isArray(message?.content)) {
    for (const part of message.content as Array<{ image_url?: { url?: unknown } }>) {
      const url = part?.image_url?.url;
      if (typeof url === 'string') candidates.push(url);
    }
  }
  if (typeof message?.content === 'string' && /^data:image\//i.test(message.content.trim())) {
    candidates.push(message.content.trim());
  }
  return candidates;
}

function decodeDataUrl(value: string): { image: Buffer; mime: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value.trim());
  if (!match) return null;
  if (match[2].length > MAX_IMAGE_BYTES * 2) {
    throw new OpenRouterImageError(
      'OPENROUTER_IMAGE_TOO_LARGE',
      'La imagen generada supera el límite de 5 MB de WhatsApp.',
    );
  }
  const image = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!image.length) return null;
  if (image.length > MAX_IMAGE_BYTES) {
    throw new OpenRouterImageError(
      'OPENROUTER_IMAGE_TOO_LARGE',
      'La imagen generada supera el límite de 5 MB de WhatsApp.',
    );
  }
  return { image, mime: match[1].toLowerCase() };
}

async function downloadImage(url: string): Promise<{ image: Buffer; mime: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new OpenRouterImageError(
      'OPENROUTER_IMAGE_DOWNLOAD_FAILED',
      `No se pudo descargar la imagen generada (${response.status}).`,
      response.status,
    );
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new OpenRouterImageError(
      'OPENROUTER_IMAGE_TOO_LARGE',
      'La imagen generada supera el límite de 5 MB de WhatsApp.',
    );
  }
  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > MAX_IMAGE_BYTES) {
    throw new OpenRouterImageError(
      'OPENROUTER_IMAGE_TOO_LARGE',
      'La imagen generada supera el límite de 5 MB de WhatsApp.',
    );
  }
  const mime = (response.headers.get('content-type') ?? 'image/png').split(';')[0].trim().toLowerCase();
  return { image, mime: mime.startsWith('image/') ? mime : 'image/png' };
}

async function decodeCandidate(candidate: string): Promise<{ image: Buffer; mime: string } | null> {
  const inline = decodeDataUrl(candidate);
  if (inline) return inline;
  if (/^https?:\/\//i.test(candidate)) return downloadImage(candidate);
  return null;
}

function providerMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: { message?: unknown } })?.error;
  return typeof error?.message === 'string' ? error.message : fallback;
}

// ── API pública ────────────────────────────────────────────────────────────
export async function generarImagenConOpenRouter(
  input: OpenRouterImageInput,
): Promise<OpenRouterImageResult> {
  const startedAt = Date.now();
  const prompt = input.prompt?.trim() ?? '';
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    throw new OpenRouterImageError(
      'OPENROUTER_IMAGE_INVALID_PROMPT',
      `El prompt debe tener entre 1 y ${MAX_PROMPT_CHARS} caracteres.`,
    );
  }

  const aspectRatio = input.aspectRatio?.trim() || DEFAULT_ASPECT;
  const model = input.model?.trim() || config.openRouterImage.model;
  const apiKey = config.openRouterImage.apiKey;

  if (!apiKey) {
    console.warn(JSON.stringify({
      event: 'openrouter_image',
      status: 'simulated',
      reason: 'OPENROUTER_API_KEY_MISSING',
    }));
    return placeholderResult(
      prompt,
      model,
      startedAt,
      'OPENROUTER_API_KEY no está configurada; se usó el PNG de marca local.',
    );
  }

  if (config.openRouterImage.simulate) {
    console.warn(JSON.stringify({
      event: 'openrouter_image',
      status: 'simulated',
      reason: 'OPENROUTER_IMAGE_SIMULATE',
    }));
    return placeholderResult(
      prompt,
      model,
      startedAt,
      'OPENROUTER_IMAGE_SIMULATE=true; se usó el PNG de marca local.',
    );
  }

  const content = input.referenceImageUrl
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: input.referenceImageUrl } },
      ]
    : prompt;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.PUBLIC_API_URL || 'https://imvolt.app',
        'X-Title': 'Imvolt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nFormato de salida: ${aspectRatio}.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(Math.min(120000, Math.max(5000, config.openRouterImage.timeoutMs))),
    });

    const rawText = await response.text();
    let payload: unknown = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = { raw: rawText.slice(0, 500) };
    }

    if (!response.ok) {
      throw new OpenRouterImageError(
        response.status === 402 ? 'OPENROUTER_IMAGE_INSUFFICIENT_CREDITS' : 'OPENROUTER_IMAGE_PROVIDER_ERROR',
        providerMessage(payload, `OpenRouter respondió ${response.status}.`),
        response.status,
      );
    }

    let decoded: { image: Buffer; mime: string } | null = null;
    for (const candidate of imageCandidates(payload)) {
      decoded = await decodeCandidate(candidate);
      if (decoded) break;
    }
    if (!decoded) {
      throw new OpenRouterImageError(
        'OPENROUTER_IMAGE_INVALID_RESPONSE',
        'OpenRouter no devolvió una imagen utilizable.',
      );
    }

    const usage = (payload as { usage?: { cost?: unknown } })?.usage;
    const estimatedCostUsd =
      typeof usage?.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0
        ? usage.cost
        : null;
    const text = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
      ?.choices?.[0]?.message?.content;
    const result: OpenRouterImageResult = {
      image: decoded.image,
      mime: decoded.mime,
      model,
      prompt,
      durationMs: Date.now() - startedAt,
      estimatedCostUsd,
      simulated: false,
      ...(typeof text === 'string' && text.trim() ? { text: text.trim().slice(0, 2000) } : {}),
    };

    console.info(JSON.stringify({
      event: 'openrouter_image',
      status: 'succeeded',
      model,
      duration_ms: result.durationMs,
      estimated_cost_usd: result.estimatedCostUsd,
      bytes: result.image.length,
    }));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido de OpenRouter';
    const status = error instanceof OpenRouterImageError ? error.status : undefined;

    console.warn(JSON.stringify({
      event: 'openrouter_image',
      status: 'failed',
      model,
      error: error instanceof OpenRouterImageError ? error.code : 'OPENROUTER_IMAGE_ERROR',
      provider_status: status,
    }));

    if (config.openRouterImage.fallback) {
      return placeholderResult(
        prompt,
        model,
        startedAt,
        `OpenRouter no generó la imagen (${message}). Se usó el PNG de marca local para poder probar el flujo.`,
      );
    }
    throw error;
  }
}
