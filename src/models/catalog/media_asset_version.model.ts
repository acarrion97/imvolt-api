// models/catalog/media_asset_version.model.ts
// Versión concreta de un media asset: un blob dentro del bucket privado
// `media-assets`. Cada subida crea una fila nueva y pasa a ser la activa.

import { BaseModel } from '../../core';

export interface MediaAssetVersion extends BaseModel<MediaAssetVersion> {
  media_asset_version_id: number;
  media_asset_id: number;
  /** Número correlativo de la versión (1 = v1, 2 = v2...). */
  numero: number;
  nombre_archivo: string;
  /** Ruta dentro del bucket privado; NO es una URL pública. */
  ruta_storage: string;
  mime_type: string | null;
  tamano_bytes: number | null;
  /** Qué cambió en esta versión (nota opcional del usuario). */
  nota: string | null;
  /** Usuario local que subió el medio (FK → usuarios; null si no aplica). */
  subido_por: number | null;
  empresa_id: number;
}
