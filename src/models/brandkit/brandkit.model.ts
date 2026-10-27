import { BaseModel } from "../../core";
import { Empresa } from "../identity/empresa.model";

/**
 * Categorías de archivo del Brand Kit.
 * Catálogo fijo: lo validan el Request (Joi), lo documenta OpenAPI y lo
 * ofrece el frontend en el select del formulario.
 */
export const CATEGORIAS_ASSET = [
  'logo_horizontal',
  'logo_isotipo',
  'tipografia',
  'imagen_referencia',
  'plantilla_documento',
  'otro',
] as const;

export type CategoriaAsset = (typeof CATEGORIAS_ASSET)[number];

/**
 * Roles que un color puede cumplir dentro de la identidad de la empresa.
 * Catálogo fijo (mismo patrón que las categorías de archivo).
 */
export const USOS_COLOR = ['principal', 'secundario', 'acento', 'fondo', 'texto'] as const;

export type UsoColor = (typeof USOS_COLOR)[number];

/** Bucket de Supabase Storage que aloja los archivos del Brand Kit. */
export const BRAND_KIT_BUCKET = 'brand-kit';

/** Archivo lógico del Brand Kit (p. ej. "Logo horizontal principal"). */
export interface BrandAsset extends BaseModel<BrandAsset> {
  brand_asset_id: string;
  nombre: string;
  categoria: CategoriaAsset;
  descripcion: string | null;
  /** Puntero a la versión activa (id en `brand_asset_versions`). */
  version_activa_id: string | null;
  /**
   * Contador monotónico de numeración: el PRÓXIMO número que se asignará.
   * Solo avanza, de modo que un número ya usado no se recicla aunque se borre
   * la versión más reciente. Gestionado por el API, no por el cliente.
   */
  siguiente_numero: number;
  empresa_id: number;
}

/** Una versión concreta del archivo: un blob subido al bucket. */
export interface BrandAssetVersion extends BaseModel<BrandAssetVersion> {
  brand_asset_version_id: string;
  brand_asset_id: string;
  /** Número correlativo de la versión dentro del archivo (1 = v1). */
  numero: number;
  nombre_archivo: string;
  /** Ruta dentro del bucket privado (no es una URL pública). */
  ruta_storage: string;
  mime_type: string | null;
  tamano_bytes: number | null;
  /** Qué cambió en esta versión. */
  nota: string | null;
  subido_por: number | null;
  empresa_id: number;
}

/** Color de la paleta corporativa de la empresa. */
export interface BrandColor extends BaseModel<BrandColor> {
  brand_color_id: string;
  nombre: string;
  /** Código hexadecimal (#RRGGBB). */
  hex: string;
  uso: UsoColor;
  /** Orden de presentación en la paleta. */
  orden: number;
  empresa_id: number;
}

/** MODELO DE VISUALIZACIÓN: el archivo con su versión activa incrustada. */
export interface BrandAssetView extends BrandAsset {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
  /** Versión activa del archivo (la que se sirve al descargar). */
  version_activa: BrandAssetVersion | null;
}

/** MODELO DE VISUALIZACIÓN: el color con su empresa incrustada. */
export interface BrandColorView extends BrandColor {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
}

/** Campos de metadatos aceptados al crear/actualizar un archivo (sin blob). */
export interface BrandAssetPayload {
  nombre: string;
  categoria: CategoriaAsset;
  descripcion?: string | null;
}

/** Campos de metadatos aceptados al crear/actualizar un color. */
export interface BrandColorPayload {
  nombre: string;
  hex: string;
  uso?: UsoColor;
  orden?: number;
}
