// services/media.storage.ts
// Storage de Media Assets: subida, historial de versiones y URL firmada de los
// blobs del bucket PRIVADO `media-assets` (§12: persistir los medios finales en
// almacenamiento propio, no depender del CDN del proveedor).
//
// Reglas del módulo (mismo patrón que `brandkit.storage.ts`):
//
//   • Límite de carga: 100 MB por archivo (413 si se supera) — más holgado que
//     el Brand Kit porque aquí conviven videos y renders pesados.
//   • Tipos permitidos: catálogo por categoría (415 si no corresponde).
//   • El bucket nunca es público: para ver o bajar un medio la API entrega
//     una URL firmada de 5 minutos tras validar sesión + tenant.
//
// La validación CLIENTE espejo vive en el frontend solo para anticipar el
// error: aquí es donde de verdad se aplica (RF-01 / §12: el navegador no toca
// storage).

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { CategoriaMedia } from '../models/catalog';

/** Bucket privado donde viven los blobs de los media assets. */
export const BUCKET = 'media-assets';

/** Límite de carga por archivo (100 MB). El bucket también lo impone. */
export const LIMITE_BYTES_ARCHIVO = 100 * 1024 * 1024;

/** Duración de la URL firmada (segundos): la previsualización la pide antes. */
export const SEGUNDOS_URL_FIRMADA = 300;

/**
 * MIME types permitidos por categoría. Si cambias uno, cambia también el
 * `allowed_mime_types` del bucket en `database/schema.sql`.
 */
export const MIME_POR_CATEGORIA: Record<CategoriaMedia, readonly string[]> = {
  imagen: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm'],
  documento: ['application/pdf'],
  otro: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'application/pdf',
  ],
};

/** MIME inferido de la extensión (el navegador puede no reportar `file.type`). */
const MIME_POR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
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

/** Extensión en minúscula sin punto (`render.MP4` → `mp4`). */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > -1 ? nombre.slice(punto + 1).toLowerCase() : '';
}

/**
 * MIME real del archivo: usa el declarado por el navegador y, si viene vacío
 * o genérico, lo deduce de la extensión.
 */
export function resolverMime(archivo: ArchivoSubido): string {
  if (!MIME_GENERICO.has(archivo.mime)) return archivo.mime;
  return MIME_POR_EXTENSION[extensionDe(archivo.nombre)] ?? archivo.mime;
}

/**
 * Valida tamaño y tipo ANTES de tocar el storage.
 *
 *   • 413 → supera el límite de 100 MB.
 *   • 400 → archivo vacío.
 *   • 415 → el tipo no corresponde a la categoría del medio.
 */
export function validarArchivo(archivo: ArchivoSubido, categoria: CategoriaMedia): string {
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
  //    la categoría (evita renombrar un .exe a .mp4 y subirlo igual).
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

/** Ruta dentro del bucket, aislada por empresa y medio. */
export function rutaVersion(
  empresaId: number | string,
  mediaAssetId: number | string,
  numero: number,
  nombre: string
): string {
  return `empresa_${empresaId}/${mediaAssetId}/v${numero}-${nombreArchivoSeguro(nombre)}`;
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
 * Crea el bucket si no existe y le fija sus límites (100 MB + MIME permitidos).
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
      console.log(`[media-assets] Bucket '${BUCKET}' creado (privado, 100 MB, MIME permitidos).`);
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
      console.log(`[media-assets] Bucket '${BUCKET}' ajustado (privado, 100 MB, MIME permitidos).`);
    }
  } catch (error) {
    console.warn(
      `[media-assets] No se pudo verificar el bucket '${BUCKET}':`,
      error instanceof Error ? error.message : error
    );
  }
}
