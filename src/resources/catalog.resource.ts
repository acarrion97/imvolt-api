// resources/catalog.resource.ts
// Vistas de respuesta del módulo Catálogo.
//
// `proyecto` incrusta su empresa. `media_asset` incrusta su empresa, su
// proyecto y su propiedad (cuando el medio está asociado a alguno) y la
// versión activa (la que se sirve al previsualizar/descargar).

import { BaseResource } from '../core/base.resource';
import {
  MediaAssetVersion,
  MediaAssetView,
  ProyectoView,
} from '../models/catalog';
import { empresaResource } from './identity.resource';

export const proyectoResource = new BaseResource<any, ProyectoView>((row) => ({
  proyecto_id: row.proyecto_id,
  nombre: row.nombre,
  tipo: row.tipo,
  descripcion: row.descripcion ?? null,
  ubicacion: row.ubicacion ?? null,
  total_lotes: row.total_lotes ?? null,
  empresa_id: row.empresa_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjeto FK (la tabla incrustada llega en plural).
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
}));

/**
 * Referencia ligera de un proyecto, incrustada en propiedades y medios: el
 * join anidado no trae `empresas`, así que no se formatea el subobjeto
 * completo (que quedaría con `empresa: null` engañoso).
 */
export const proyectoReferenciaResource = new BaseResource<
  any,
  { proyecto_id: number; nombre: string; tipo: string }
>((row) => ({
  proyecto_id: row.proyecto_id,
  nombre: row.nombre,
  tipo: row.tipo,
}));

export const mediaAssetVersionResource = new BaseResource<
  any,
  Omit<MediaAssetVersion, 'ruta_storage'>
>((row) => ({
  media_asset_version_id: row.media_asset_version_id,
  media_asset_id: row.media_asset_id,
  numero: row.numero,
  nombre_archivo: row.nombre_archivo,
  // La ruta del bucket no se expone: para ver el archivo hay que pedir la
  // URL firmada (GET /media-assets/:id/versiones/:vid/descarga).
  mime_type: row.mime_type ?? null,
  tamano_bytes: row.tamano_bytes ?? null,
  nota: row.nota ?? null,
  subido_por: row.subido_por ?? null,
  empresa_id: row.empresa_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

/**
 * Referencia ligera de una propiedad dentro de un medio: no se incrusta la
 * propiedad completa (con su empresa y su tipo) para no duplicar subárboles;
 * basta con identificarla para navegar a su ficha.
 */
export const propiedadReferenciaResource = new BaseResource<
  any,
  { propiedad_id: number; nombre: string; ubicacion: string | null }
>((row) => ({
  propiedad_id: row.propiedad_id,
  nombre: row.nombre,
  ubicacion: row.ubicacion ?? null,
}));

export const mediaAssetResource = new BaseResource<any, MediaAssetView>((row) => ({
  media_asset_id: row.media_asset_id,
  nombre: row.nombre,
  categoria: row.categoria,
  descripcion: row.descripcion ?? null,
  proyecto_id: row.proyecto_id ?? null,
  propiedad_id: row.propiedad_id ?? null,
  version_activa_id: row.version_activa_id ?? null,
  empresa_id: row.empresa_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjetos FK: llegan como `empresas`, `proyectos`, `propiedades` y
  // `media_asset_versions` (la relación elegida es
  // `fk_media_asset_version_activa`).
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
  proyecto: row.proyectos ? proyectoReferenciaResource.format(row.proyectos) : null,
  propiedad: row.propiedades
    ? propiedadReferenciaResource.format(row.propiedades)
    : null,
  version_activa: row.media_asset_versions
    ? mediaAssetVersionResource.format(row.media_asset_versions)
    : null,
}));
