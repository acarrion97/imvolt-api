// services/brandkit.storage.ts
// Storage del Brand Kit: subida, borrador de vida y URL firmada de los blobs
// del bucket PRIVADO `brand-kit`.
//
// Reglas del módulo (espejo del cliente en `imvolt/src/domain/brand-kit`):
//
//   • Límite de carga: 10 MB por archivo (413 si se supera).
//   • Tipos permitidos: catálogo por categoría (415 si no corresponde).
//   • El bucket nunca es público: para ver o bajar un archivo la API entrega
//     una URL firmada de 5 minutos tras validar sesión + tenant.
//
// La misma validación vive en el frontend SOLO para anticipar el error: aquí
// es donde de verdad se aplica (RF-01 / §12: el navegador no toca storage).

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { CategoriaAsset } from '../models/brandkit';

/** Bucket privado donde viven los blobs del Brand Kit. */
export const BUCKET = 'brand-kit';

/** Límite de carga por archivo (10 MB). El bucket también lo impone. */
export const LIMITE_BYTES_ARCHIVO = 10 * 1024 * 1024;

/** Duración de la URL firmada (segundos): la previsualización la pide antes. */
export const SEGUNDOS_URL_FIRMADA = 300;

/**
 * MIME types permitidos por categoría. Espejo EXACTO de `MIME_POR_CATEGORIA`
 * en `imvolt/src/domain/brand-kit/index.ts`: si cambias uno, cambia el otro.
 */
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

/** MIME genéricos que no sirven para validar (el navegador no los conoce). */
const MIME_GENERICO = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** Todo el catálogo unido: es lo que se le impone al bucket como allow-list. */
export const MIME_TOTALES: string[] = Array.from(
  new Set([...Object.values(MIME_POR_CATEGORIA).flat()])
);

export interface ArchivoSubido {
  /** Nombre original del archivo (se sanea antes de usarlo como clave). */
  nombre: string;
  /** MIME declarado por el cliente. */
  mime: string;
  /** Tamaño en bytes. */
  bytes: number;
}

/** Extensión en minúscula sin punto (`logo.SVG` → `svg`). */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > -1 ? nombre.slice(punto + 1).toLowerCase() : '';
}

/**
 * MIME real del archivo: usa el declarado por el navegador y, si viene vacío
 * o genérico (típico en fuentes .woff2/.otf), lo deduce de la extensión.
 */
export function resolverMime(archivo: ArchivoSubido): string {
  if (!MIME_GENERICO.has(archivo.mime)) return archivo.mime;
  return MIME_POR_EXTENSION[extensionDe(archivo.nombre)] ?? archivo.mime;
}

/**
 * Valida tamaño y tipo ANTES de tocar el storage.
 *
 *   • 413 → supera el límite de 10 MB.
 *   • 400 → archivo vacío.
 *   • 415 → el tipo no corresponde a la categoría del archivo.
 */
export function validarArchivo(archivo: ArchivoSubido, categoria: CategoriaAsset): string {
  if (archivo.bytes > LIMITE_BYTES_ARCHIVO) {
    throw new HttpError(
      413,
      `El archivo supera el máximo de ${LIMITE_BYTES_ARCHIVO / 1024 / 1024} MB.`
    );
  }
  if (archivo.bytes <= 0) {
    throw new HttpError(400, 'El archivo está vacío.');
  }

  const permitidos = MIME_POR_CATEGORIA[categoria] ?? MIME_POR_CATEGORIA.otro;
  const mime = resolverMime(archivo);

  // 1) El MIME declarado por el navegador, si es conocido, debe corresponder a
  //    la categoría (evita renombrar un .exe a .png y subirlo igual).
  if (!MIME_GENERICO.has(archivo.mime) && !permitidos.includes(archivo.mime)) {
    throw new HttpError(
      415,
      `Tipo de archivo no permitido para "${categoria}". Aceptados: ${permitidos.join(', ')}.`
    );
  }
  // 2) El MIME efectivo (declarado o deducido de la extensión) también.
  if (!permitidos.includes(mime)) {
    throw new HttpError(
      415,
      `Tipo de archivo no permitido para "${categoria}". Aceptados: ${permitidos.join(', ')}.`
    );
  }
  return mime;
}

/**
 * Sanea el nombre para usarlo dentro del bucket: solo el basename (nada de
 * `../`), sin espacios ni caracteres de ruta.
 */
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

/** Sube el blob al bucket. Falla con 500 si el storage rechaza la operación. */
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

/**
 * Borra uno o varios blobs. Mejor-esfuerzo: si el objeto ya no existe la
 * operación continúa (la fila de la versión es lo que importa borrar).
 */
export async function borrarArchivos(rutas: string[]): Promise<void> {
  if (!rutas.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(rutas);
  if (error) {
    throw new HttpError(500, `No se pudieron eliminar archivos del bucket: ${error.message}`);
  }
}

/**
 * Crea el bucket si no existe y le fija sus límites (10 MB + MIME permitidos).
 * Se llama una vez al arrancar la API: si el bucket ya existe solo se ajustan
 * las políticas de carga, sin tocar los archivos almacenados.
 */
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
