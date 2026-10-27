// resources/advertising.resource.ts
// Vistas de respuesta del módulo Publicidad.
//
// `campania_publicitaria` incrusta su propiedad y su objetivo como subobjetos.

import { BaseResource } from '../core/base.resource';
import { CampaniaPublicitariaView } from '../models/advertising/campania_publicitaria.model';
import { ObjetivoPublicidad } from '../models/advertising/objetivo_publicidad.model';
import { CampaignView } from '../models/advertising/campaign.model';
import { ConexionView } from '../models/advertising/conexion.model';
import { propiedadResource } from './property.resource';

const idString = (value: unknown): string | null => value == null ? null : String(value);
const objetivoSlug = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, '_');

export const conexionResource = new BaseResource<any, ConexionView>((row) => ({
  connection_id: String(row.conexion_id),
  organization_id: idString(row.empresa_id),
  cuenta_publicitaria_id: row.cuenta_publicitaria_id,
  nombre_cuenta: row.nombre_cuenta,
  estado: row.estado,
  permisos: row.permisos ?? null,
  created_at: new Date(row.creado_en).toISOString(),
}));

export const campaignResource = new BaseResource<any, CampaignView>((row) => ({
  campaign_id: String(row.campania_publicitaria_id),
  organization_id: idString(row.empresa_id),
  connection_id: idString(row.conexion_id),
  property_id: idString(row.propiedad_id),
  nombre: row.nombre ?? '',
  objetivo: objetivoSlug(row.objetivo_publicidad?.nombre),
  destino: row.destino,
  estado: row.estado_flujo,
  presupuesto_maximo: Number(row.presupuesto_diario),
  moneda: row.moneda,
  fecha_inicio: row.fecha_inicio ?? null,
  fecha_fin: row.fecha_fin ?? null,
  titulo: row.titulo ?? null,
  copy: row.copy_anuncio ?? null,
  cta: row.cta ?? null,
  creative_url: row.creative_url ?? null,
  meta_campaign_id: row.meta_campaign_id ?? null,
  created_at: new Date(row.creado_en).toISOString(),
  updated_at: new Date(row.actualizado_en).toISOString(),
}));

export const objetivoPublicidadResource = new BaseResource<any, ObjetivoPublicidad>((row) => ({
  objetivo_publicidad_id: row.objetivo_publicidad_id,
  nombre: row.nombre,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const campaniaPublicitariaResource = new BaseResource<any, CampaniaPublicitariaView>((row) => ({
  campania_publicitaria_id: row.campania_publicitaria_id,
  propiedad_id: row.propiedad_id,
  objetivo_publicidad_id: row.objetivo_publicidad_id,
  presupuesto_diario: row.presupuesto_diario,
  duracion_dias: row.duracion_dias,
  zona_referencia: row.zona_referencia,
  copy_anuncio: row.copy_anuncio,
  meta_campaign_id: row.meta_campaign_id ?? null,
  meta_estado: row.meta_estado ?? null,
  publicada_en: row.publicada_en ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjetos FK (las tablas incrustadas llegan en plural).
  propiedad: row.propiedades ? propiedadResource.format(row.propiedades) : null,
  objetivo_publicidad: row.objetivo_publicidad
    ? objetivoPublicidadResource.format(row.objetivo_publicidad)
    : null,
}));
