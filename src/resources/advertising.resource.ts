// resources/advertising.resource.ts
// Vistas de IMVOLT Ads.

import { BaseResource } from '../core/base.resource';

const asArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export const conexionResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  connection_id: row.connection_id,
  organization_id: row.organization_id,
  cuenta_publicitaria_id: row.cuenta_publicitaria_id,
  nombre_cuenta: row.nombre_cuenta,
  estado: row.estado,
  permisos: asArray(row.permisos),
  created_at: row.created_at,
}));

export const campanaResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  campaign_id: row.campaign_id,
  organization_id: row.organization_id,
  connection_id: row.connection_id ?? null,
  property_id: row.property_id ?? null,
  nombre: row.nombre,
  objetivo: row.objetivo,
  destino: row.destino,
  estado: row.estado,
  presupuesto_maximo: row.presupuesto_maximo,
  moneda: row.moneda ?? 'USD',
  fecha_inicio: row.fecha_inicio ?? null,
  fecha_fin: row.fecha_fin ?? null,
  copy: row.copy ?? null,
  titulo: row.titulo ?? null,
  cta: row.cta ?? null,
  creative_url: row.creative_url ?? null,
  meta_campaign_id: row.meta_campaign_id ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
}));

export const aprobacionResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  approval_id: row.approval_id,
  campaign_id: row.campaign_id,
  organization_id: row.organization_id,
  aprobado_por: row.aprobado_por,
  decision: row.decision,
  comentario: row.comentario ?? null,
  created_at: row.created_at,
}));

export const insightResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  snapshot_id: row.snapshot_id,
  campaign_id: row.campaign_id,
  organization_id: row.organization_id,
  gasto: row.gasto ?? 0,
  impresiones: row.impresiones ?? 0,
  clics: row.clics ?? 0,
  leads: row.leads ?? 0,
  alcance: row.alcance ?? null,
  tomado_en: row.tomado_en,
}));
