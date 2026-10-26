// models/catalog/media_asset.model.ts
// Medio final de la empresa (foto, render, video, documento) guardado en
// almacenamiento propio (§12: no depender del CDN del proveedor).
//
// Un medio es METADATOS: el blob vive en el bucket privado `media-assets` como
// una fila hija en `media_asset_versions`. `version_activa_id` apunta a la
// versión que se sirve al previsualizar o descargar (URL firmada de 5 min).

import { BaseModel } from '../../core';
import { Empresa } from '../identity/empresa.model';
import { MediaAssetVersion } from './media_asset_version.model';

/**
 * Categorías de un medio: definen qué tipos de archivo se aceptan al subir.
 * Catálogo fijo, idéntico al validado por la API (`services/media.storage.ts`).
 */
export const CATEGORIAS_MEDIA = ['imagen', 'video', 'documento', 'otro'] as const;

export type CategoriaMedia = (typeof CATEGORIAS_MEDIA)[number];

/**
 * Referencia ligera de un proyecto, incrustada en otros recursos (p. ej.
 * propiedades y medios): el join anidado no trae sus relaciones, así que solo
 * se expone lo necesario para identificarlo y navegar a su ficha.
 */
export interface ProyectoReferencia {
  proyecto_id: number;
  nombre: string;
  tipo: string;
}

/**
 * Referencia ligera de una propiedad, incrustada en los medios: no se duplica
 * el subárbol completo (empresa + tipo) del recurso `propiedad`.
 */
export interface PropiedadReferencia {
  propiedad_id: number;
  nombre: string;
  ubicacion: string | null;
}

export interface MediaAsset extends BaseModel<MediaAsset> {
  media_asset_id: number;
  nombre: string;
  categoria: CategoriaMedia;
  descripcion: string | null;
  /** Desarrollo al que pertenece el medio (nullable). */
  proyecto_id: number | null;
  /** Inmueble promocionado por el medio (nullable). */
  propiedad_id: number | null;
  /** Puntero a la versión activa (FK → media_asset_versions). */
  version_activa_id: number | null;
  empresa_id: number;
}

/** MODELO DE VISUALIZACIÓN: el medio con sus relaciones incrustadas. */
export interface MediaAssetView extends MediaAsset {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
  /** Relación incrustada (FK → proyectos; referencia ligera). */
  proyecto: ProyectoReferencia | null;
  /** Relación incrustada (FK → propiedades; referencia ligera). */
  propiedad: PropiedadReferencia | null;
  /** Relación incrustada (FK → media_asset_versions por `version_activa_id`).
   *  Sin `ruta_storage`: la ruta interna del bucket jamás sale del API. */
  version_activa: Omit<MediaAssetVersion, 'ruta_storage'> | null;
}
