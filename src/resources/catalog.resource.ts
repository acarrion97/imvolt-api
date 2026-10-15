// resources/catalog.resource.ts
// Vistas del catálogo inmobiliario.

import { BaseResource } from '../core/base.resource';

export const proyectoResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  project_id: row.project_id,
  organization_id: row.organization_id,
  nombre: row.nombre,
  tipo: row.tipo,
  descripcion: row.descripcion ?? null,
  ubicacion: row.ubicacion ?? null,
  total_lotes: row.total_lotes ?? null,
  estado: row.estado,
  created_at: row.created_at,
}));

export const propiedadResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  property_id: row.property_id,
  organization_id: row.organization_id,
  project_id: row.project_id ?? null,
  nombre: row.nombre,
  categoria: row.categoria,
  titulo_publicacion: row.titulo_publicacion ?? null,
  descripcion: row.descripcion ?? null,
  precio: row.precio ?? null,
  moneda: row.moneda ?? 'USD',
  superficie_m2: row.superficie_m2 ?? null,
  habitaciones: row.habitaciones ?? null,
  banos: row.banos ?? null,
  estacionamientos: row.estacionamientos ?? null,
  direccion: row.direccion ?? null,
  ciudad: row.ciudad ?? null,
  pais: row.pais ?? null,
  estado: row.estado,
  tiene_render_conceptual: row.tiene_render_conceptual ?? false,
  created_at: row.created_at,
}));

export const mediaResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  media_id: row.media_id,
  organization_id: row.organization_id,
  property_id: row.property_id ?? null,
  tipo: row.tipo,
  nombre: row.nombre,
  url: row.url,
  es_referencia_original: row.es_referencia_original ?? false,
  created_at: row.created_at,
}));

export const brandKitResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  brand_kit_id: row.brand_kit_id,
  organization_id: row.organization_id,
  nombre: row.nombre,
  logo_url: row.logo_url ?? null,
  color_primario: row.color_primario ?? null,
  color_secundario: row.color_secundario ?? null,
  tipografia: row.tipografia ?? null,
  created_at: row.created_at,
}));
