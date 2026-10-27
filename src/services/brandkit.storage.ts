// Storage del Brand Kit: subida, borrado y URL firmada de los blobs
// del bucket PRIVADO `brand-kit`.
//
// La API valida sesión + tenant antes de emitir una URL firmada de 5 minutos;
// el navegador no accede al bucket directamente.

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { CategoriaAsset } from '../models/brandkit';

/** Bucket privado donde viven los blobs del Brand Kit. */
export const BUCKET = 'brand-kit';

/** Límite de carga por archivo (10 MB). El bucket también lo impone. */
export const LIMITE_BYTES_ARCHIVO = 10 * 1024 * 1024;

/** Duración de la URL firmada (segundos). */
export const SEGUNDOS_URL_FIRMADA = 300;

/** MIME types permitidos por categoría. */
export const MIME_POR_CATEGORIA: Record<CategoriaAsset, readonly string[]> = {
  logo_horizontal: ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'],
  logo_isotipo: ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'],
  tipografia: ['font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/font-woff'],
  imagen_referencia: ['image/png', 'image/jpeg', 'image/webp'],
  plantilla_documento: ['application/pdf'],
  otro: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'font/woff',
    'font/woff2',
  ],
};

/** MIME inferido de la extensión (el navegador puede no reportar `file.type`). */
const MIME_POR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

const MIME_GENERICO = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export const MIME_TOTALES: string[] = Array.from(
  new Set([...Object.values(MIME_POR_CATEGORIA).flat()])
);

export interface ArchivoSubido {
  nombre: string;
  mime: string;
  bytes: number;
  buffer: Buffer;
}

/** Extensión en minúscula sin punto (`logo.SVG` → `svg`). */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > -1 ? nombre.slice(punto + 1).toLowerCase() : '';
}

function detectarTipoReal(buffer: Buffer): string | null {
  const texto = (desde: number, hasta: number): string =>
    buffer.subarray(desde, hasta).toString('latin1');

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && texto(0, 4) === 'RIFF' && texto(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 5 && texto(0, 5) === '%PDF-') return 'application/pdf';

  if (buffer.length >= 4 && texto(0, 4) === 'wOFF') return 'font/woff';
  if (buffer.length >= 4 && texto(0, 4) === 'wOF2') return 'font/woff2';
  if (buffer.length >= 4 && texto(0, 4) === 'OTTO') return 'font/otf';
  if (buffer.length >= 4 && (texto(0, 4) === 'ttcf' || texto(0, 4) === 'true')) {
    return 'font/ttf';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x01 &&
    buffer[2] === 0x00 &&
    buffer[3] === 0x00
  ) {
    return 'font/ttf';
  }

  const cabecera = buffer.subarray(0, 2048).toString('utf8');
  if (/<svg[\s>]/i.test(cabecera)) return 'image/svg+xml';
  return null;
}

/**
 * Valida contenido, tamaño y categoría. La firma binaria manda sobre el MIME
 * declarado por el cliente; SVG, por ser texto, se reconoce por su contenido.
 */
export function validarArchivo(archivo: ArchivoSubido, categoria: CategoriaAsset): string {
  if (!archivo.buffer?.length || archivo.bytes <= 0) {
    throw new HttpError(400, 'El archivo está vacío.');
  }
  if (archivo.bytes > LIMITE_BYTES_ARCHIVO) {
    throw new HttpError(
      413,
      `El archivo supera el máximo de ${LIMITE_BYTES_ARCHIVO / 1024 / 1024} MB.`
    );
  }

  const permitidos = MIME_POR_CATEGORIA[categoria] ?? MIME_POR_CATEGORIA.otro;
  const mimeReal = detectarTipoReal(archivo.buffer);
  if (!mimeReal || !permitidos.includes(mimeReal)) {
    throw new HttpError(
      415,
      `Tipo de archivo no permitido para "${categoria}". Aceptados: ${permitidos.join(', ')}.`
    );
  }

  const mimeDeclarado = MIME_GENERICO.has(archivo.mime)
    ? MIME_POR_EXTENSION[extensionDe(archivo.nombre)]
    : archivo.mime;
  if (mimeDeclarado && mimeDeclarado !== mimeReal) {
    throw new HttpError(415, 'El tipo declarado no coincide con el contenido del archivo.');
  }

  return mimeReal;
}

/** Sanea el nombre para usarlo dentro del bucket: solo el basename. */
export function nombreArchivoSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? 'archivo';
  const limpio = base
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-100);
  return limpio.replace(/^[.\-_]+/, '') || 'archivo';
}

/** Ruta dentro del bucket, aislada por empresa y archivo. */
export function rutaVersion(
  empresaId: number | string,
  assetId: number | string,
  numero: number,
  nombre: string
): string {
  return `empresa_${empresaId}/${assetId}/v${numero}-${nombreArchivoSeguro(nombre)}`;
}

/** Sube el blob. Falla con 500 si Storage rechaza la operación. */
export async function subirArchivo(
  ruta: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, buffer, { contentType, upsert: false, cacheControl: '3600' });
  if (error) {
    throw new HttpError(500, `No se pudo guardar el archivo en el bucket: ${error.message}`);
  }
}

/** URL firmada de corta duración para un blob privado. */
export async function urlFirmada(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ruta, SEGUNDOS_URL_FIRMADA);
  if (error || !data?.signedUrl) {
    throw new HttpError(500, `No se pudo generar la URL de descarga: ${error?.message ?? ''}`);
  }
  return data.signedUrl;
}

/** Borra uno o varios blobs; los errores no se silencian. */
export async function borrarArchivos(rutas: string[]): Promise<void> {
  if (!rutas.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(rutas);
  if (error) {
    throw new HttpError(500, `No se pudieron eliminar archivos del bucket: ${error.message}`);
  }
}

/** Crea el bucket si no existe o aplica sus límites de privacidad y tamaño. */
export async function asegurarBucket(): Promise<void> {
  try {
    const { data: bucket, error: readError } = await supabase.storage.getBucket(BUCKET);

    if (readError || !bucket) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: LIMITE_BYTES_ARCHIVO,
        allowedMimeTypes: MIME_TOTALES,
      });
      if (createError) throw new Error(createError.message);
      console.log(`[brand-kit] Bucket '${BUCKET}' creado (privado, 10 MB, MIME permitidos).`);
      return;
    }

    const mismosMime =
      (bucket.allowed_mime_types ?? []).length === MIME_TOTALES.length &&
      (bucket.allowed_mime_types ?? []).every((mime) => MIME_TOTALES.includes(mime));
    if (bucket.public || Number(bucket.file_size_limit) !== LIMITE_BYTES_ARCHIVO || !mismosMime) {
      const { error: updateError } = await supabase.storage.updateBucket(BUCKET, {
        public: false,
        fileSizeLimit: LIMITE_BYTES_ARCHIVO,
        allowedMimeTypes: MIME_TOTALES,
      });
      if (updateError) throw new Error(updateError.message);
      console.log(`[brand-kit] Bucket '${BUCKET}' ajustado (privado, 10 MB, MIME permitidos).`);
    }
  } catch (error) {
    console.warn(
      `[brand-kit] No se pudo verificar el bucket '${BUCKET}':`,
      error instanceof Error ? error.message : error
    );
  }
}
