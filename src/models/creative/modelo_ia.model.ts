// models/creative/modelo_ia.model.ts
// Catálogo vivo de modelos de generación IA (§09: no hardcodear el catálogo).
//
// Se sirve sobre `public.modelos_ia` en `/api/v1/modelos` con el contrato del
// frontend: `model_id`/`provider_model_id` viajan como texto y `status` son los
// valores de la columna `estado` ('activo' | 'inactivo' | 'no_disponible').

export type ModeloMediaType = 'image' | 'video';

export type ModeloStatus = 'activo' | 'inactivo' | 'no_disponible';

/** Fila de `public.modelos_ia`. */
export interface ModeloIa {
  modelo_id: number;
  proveedor: string;
  modelo_proveedor_id: string;
  nombre: string;
  tipo_media: ModeloMediaType;
  capacidades: Record<string, unknown>;
  duracion_min_s: number | null;
  duracion_max_s: number | null;
  ratios: string[] | null;
  creditos_cotizacion: number;
  estado: ModeloStatus;
  creado_en: string;
  actualizado_en: string;
}

/** Vista del recurso `/v1/modelos` (contrato del frontend). */
export interface ModeloIaView {
  model_id: string;
  provider: string;
  provider_model_id: string;
  nombre: string;
  media_type: ModeloMediaType;
  capabilities: Record<string, unknown>;
  duracion_min_s: number | null;
  duracion_max_s: number | null;
  ratios: string[] | null;
  quote_creditos: number;
  status: ModeloStatus;
  created_at: string;
}
