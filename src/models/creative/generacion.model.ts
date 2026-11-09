// models/creative/generacion.model.ts
// Job de generación IA (§09) con el CONTRATO que consume el frontend en
// `/api/v1/creative/generations`.
//
// Se sirve sobre `public.generaciones`:
//
//   generation_id       → generacion_id
//   organization_id     → empresa_id
//   property_id         → propiedad_id
//   template_id         → plantilla_id
//   model_id            → modelo_id
//   price_usd           → precio_usd (lo cotiza SIEMPRE el API)
//   status              → estado  (created → … → completed/failed)
//   provider_request_id → peticion_proveedor_id
//   error_message       → error_mensaje

/** Máquina de estados §09. */
export type GeneracionEstado =
  | 'created'
  | 'quoted'
  | 'credits_reserved'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

/** Estados terminales: no vuelven a consultar al proveedor. */
export const ESTADOS_FINALES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'canceled',
]);

const TRANSICIONES_PERMITIDAS: Record<GeneracionEstado, ReadonlySet<GeneracionEstado>> = {
  created: new Set(['quoted', 'failed', 'canceled']),
  quoted: new Set(['queued', 'failed', 'canceled']),
  credits_reserved: new Set(['queued', 'failed', 'canceled']),
  queued: new Set(['processing', 'completed', 'failed', 'canceled']),
  processing: new Set(['completed', 'failed', 'canceled']),
  completed: new Set(),
  failed: new Set(),
  canceled: new Set(),
};

export function puedeTransicionarGeneracion(
  actual: GeneracionEstado,
  siguiente: GeneracionEstado,
): boolean {
  return TRANSICIONES_PERMITIDAS[actual].has(siguiente);
}

/** Fila de `public.generaciones`. */
export interface Generacion {
  generacion_id: number;
  empresa_id: number;
  propiedad_id: number | null;
  plantilla_id: number | null;
  modelo_id: number;
  modo: 'facil' | 'pro';
  prompt: string;
  parametros: Record<string, unknown>;
  estado: GeneracionEstado;
  idempotency_key?: string | null;
  precio_usd: number | null;
  peticion_proveedor_id: string | null;
  error_mensaje: string | null;
  creado_en: string;
  actualizado_en: string;
}

/** Vista del recurso `/v1/creative/generations` (contrato del frontend). */
export interface GeneracionView {
  generation_id: string;
  organization_id: string | null;
  property_id: string | null;
  template_id: string | null;
  model_id: string;
  modo: 'facil' | 'pro';
  prompt: string;
  parametros: Record<string, unknown>;
  status: GeneracionEstado;
  price_usd: number | null;
  provider_request_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
