// resources/creative.resource.ts
// Vistas del Estudio IA.

import { BaseResource } from '../core/base.resource';

const asArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export const plantillaResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  template_id: row.template_id,
  organization_id: row.organization_id ?? null,
  nombre: row.nombre,
  categoria: row.categoria,
  objetivo: row.objetivo,
  media_type: row.media_type,
  formato: row.formato,
  variables: asArray(row.variables),
  estructura_narrativa: row.estructura_narrativa ?? null,
  movimiento_camara: row.movimiento_camara ?? null,
  estilo_visual: row.estilo_visual ?? null,
  prompt_base: row.prompt_base,
  requiere_referencia_original: row.requiere_referencia_original ?? false,
  creditos_base: row.creditos_base ?? 1,
  activo: row.activo ?? true,
  created_at: row.created_at,
}));

export const modeloResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  model_id: row.model_id,
  provider: row.provider,
  provider_model_id: row.provider_model_id,
  nombre: row.nombre,
  media_type: row.media_type,
  capabilities: row.capabilities ?? {},
  duracion_min_s: row.duracion_min_s ?? null,
  duracion_max_s: row.duracion_max_s ?? null,
  ratios: asArray(row.ratios),
  quote_creditos: row.quote_creditos ?? 1,
  status: row.status,
  created_at: row.created_at,
}));

export const generacionResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  generation_id: row.generation_id,
  organization_id: row.organization_id,
  property_id: row.property_id ?? null,
  template_id: row.template_id ?? null,
  model_id: row.model_id,
  modo: row.modo,
  prompt: row.prompt,
  parametros: row.parametros ?? {},
  status: row.status,
  credits_cost: row.credits_cost ?? 0,
  provider_request_id: row.provider_request_id ?? null,
  error_message: row.error_message ?? null,
  outputs: Array.isArray(row.generation_outputs) ? row.generation_outputs : [],
  created_at: row.created_at,
  updated_at: row.updated_at,
}));

export const outputResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  output_id: row.output_id,
  generation_id: row.generation_id,
  organization_id: row.organization_id,
  url: row.url,
  tipo: row.tipo,
  es_conceptual: row.es_conceptual ?? false,
  version: row.version ?? 1,
  created_at: row.created_at,
}));
