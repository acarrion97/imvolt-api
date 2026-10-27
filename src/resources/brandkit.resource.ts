// resources/brandkit.resource.ts
// Vistas de respuesta del módulo Brand Kit.
//
// `brand_asset` incrusta su `empresa` (FK → empresas) y su `version_activa`
// (FK → brand_asset_versions, con nombre de constraint fijo para PostgREST).
// `brand_color` incrusta únicamente su `empresa`.

import { BaseResource } from '../core/base.resource';
import { Empresa } from '../models/identity/empresa.model';
import { BrandAssetVersion } from '../models/brandkit/brand_asset_version.model';
import { BrandAssetView } from '../models/brandkit/brand_asset.model';
import { BrandColorView } from '../models/brandkit/brand_color.model';
import { empresaResource } from './identity.resource';

/** Vista de una versión del archivo (blob dentro del bucket privado). */
export const brandAssetVersionResource = new BaseResource<
  any,
  Omit<BrandAssetVersion, 'ruta_storage'>
>((row) => ({
  brand_asset_version_id: row.brand_asset_version_id,
  brand_asset_id: row.brand_asset_id,
  numero: row.numero,
  nombre_archivo: row.nombre_archivo,
  // La ruta del bucket no se expone: para ver el archivo hay que pedir la
  // URL firmada (GET /brand-assets/:id/versiones/:vid/descarga).
  mime_type: row.mime_type ?? null,
  tamano_bytes: row.tamano_bytes ?? null,
  nota: row.nota ?? null,
  subido_por: row.subido_por ?? null,
  empresa_id: row.empresa_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

/** Vista del archivo de marca con su versión activa. */
export const brandAssetResource = new BaseResource<any, BrandAssetView>((row) => ({
  brand_asset_id: row.brand_asset_id,
  nombre: row.nombre,
  categoria: row.categoria,
  descripcion: row.descripcion ?? null,
  version_activa_id: row.version_activa_id ?? null,
  siguiente_numero: row.siguiente_numero ?? 1,
  empresa_id: row.empresa_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjetos FK: llegan como `empresas` y `brand_asset_versions` (la
  // relación elegida es `fk_brand_asset_version_activa`).
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
  version_activa: row.brand_asset_versions
    ? brandAssetVersionResource.format(row.brand_asset_versions)
    : null,
}));

/** Vista del color de la paleta. */
export const brandColorResource = new BaseResource<any, BrandColorView>((row) => ({
  brand_color_id: row.brand_color_id,
  nombre: row.nombre,
  hex: row.hex,
  uso: row.uso,
  orden: row.orden,
  empresa_id: row.empresa_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
}));
