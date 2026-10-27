// models/brandkit/brand_asset.model.ts
// Archivo lógico del Brand Kit (p. ej. "Logo horizontal principal").
//
// Un archivo es METADATOS: el blob vive en el bucket privado `brand-kit` como
// una fila hija en `brand_asset_versions`. `version_activa_id` apunta a la
// versión que se sirve al previsualizar o descargar.

import { BaseModel } from '../../core';
import { Empresa } from '../identity/empresa.model';
import { BrandAssetVersion } from './brand_asset_version.model';

/** Categorías de archivo del Brand Kit (catálogo fijo validado por Joi). */
export const CATEGORIAS_ASSET = [
  'logo_horizontal',
  'logo_isotipo',
  'tipografia',
  'imagen_referencia',
  'plantilla_documento',
  'otro',
] as const;

export type CategoriaAsset = (typeof CATEGORIAS_ASSET)[number];

export interface BrandAsset extends BaseModel<BrandAsset> {
  brand_asset_id: number;
  nombre: string;
  categoria: CategoriaAsset;
  descripcion: string | null;
  /** Puntero a la versión activa (FK → brand_asset_versions). */
  version_activa_id: number | null;
  /** Próximo número de versión; avanza incluso si se elimina una versión. */
  siguiente_numero: number;
  empresa_id: number;
}

/** MODELO DE VISUALIZACIÓN: el archivo con su empresa y su versión activa. */
export interface BrandAssetView extends BrandAsset {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
  /** Relación incrustada (FK → brand_asset_versions por `version_activa_id`).
   *  Sin `ruta_storage`: la ruta interna del bucket jamás sale del API. */
  version_activa: Omit<BrandAssetVersion, 'ruta_storage'> | null;
}
