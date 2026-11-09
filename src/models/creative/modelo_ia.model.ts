// models/creative/modelo_ia.model.ts
// Catálogo vivo de modelos de generación IA (§09: no hardcodear el catálogo).
//
// Se sirve sobre `public.modelos_ia` en `/api/v1/modelos` con el contrato del
// frontend: `model_id`/`provider_model_id` viajan como texto y `status` son los
// valores de la columna `estado` ('activo' | 'inactivo' | 'no_disponible').

export type ModeloMediaType = 'image' | 'video';

export type ModeloStatus = 'activo' | 'inactivo' | 'no_disponible';

/** Unidad del precio de lista del proveedor (USD por imagen o por segundo). */
export type ModeloPrecioUnidad = 'imagen' | 'segundo';

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
  precio_usd: number | null;
  precio_unidad: ModeloPrecioUnidad | null;
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
  precio_usd: number | null;
  precio_unidad: ModeloPrecioUnidad | null;
  status: ModeloStatus;
  created_at: string;
}
