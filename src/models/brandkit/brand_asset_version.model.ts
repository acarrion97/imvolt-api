// models/brandkit/brand_asset_version.model.ts
// Versión concreta de un archivo del Brand Kit: un blob dentro del bucket
// privado `brand-kit`. Cada subida crea una fila nueva y pasa a ser la activa.

import { BaseModel } from '../../core';

export interface BrandAssetVersion extends BaseModel<BrandAssetVersion> {
  brand_asset_version_id: number;
  brand_asset_id: number;
  /** Número correlativo de la versión (1 = v1, 2 = v2...). */
  numero: number;
  nombre_archivo: string;
  /** Ruta dentro del bucket privado; NO es una URL pública. */
  ruta_storage: string;
  mime_type: string | null;
  tamano_bytes: number | null;
  /** Qué cambió en esta versión (nota opcional del usuario). */
  nota: string | null;
  /** Usuario local que subió el archivo (FK → usuarios; null si no aplica). */
  subido_por: number | null;
  empresa_id: number;
}
