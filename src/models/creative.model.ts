// models/creative.model.ts
// Estudio IA: plantillas, registro de modelos y trabajos de generación.
// Documento maestro §07 (estudio y plantillas), §09 (Higgsfield).

export type CategoriaPlantilla =
  | 'lotizaciones'
  | 'casas'
  | 'departamentos'
  | 'proyecto_planos'
  | 'publicidad_comercial'
  | 'marca_inmobiliaria';

export type ObjetivoPlantilla = 'visitas' | 'mensajes' | 'formularios' | 'branding';
export type MediaType = 'image' | 'video';
export type FormatoSalida = 'reels_9_16' | 'imagen_4_5' | 'feed_1_1' | 'banner_16_9';

export interface AiTemplate {
  template_id: string;
  /** null = plantilla del sistema disponible para todas las organizaciones. */
  organization_id: string | null;
  nombre: string;
  categoria: CategoriaPlantilla;
  objetivo: ObjetivoPlantilla;
  media_type: MediaType;
  formato: FormatoSalida;
  /** Variables obligatorias de la propiedad que consume el prompt. */
  variables: string[];
  estructura_narrativa: string | null;
  movimiento_camara: string | null;
  estilo_visual: string | null;
  prompt_base: string;
  requiere_referencia_original: boolean;
  creditos_base: number;
  activo: boolean;
  created_at: string;
}

export type EstadoModelo = 'activo' | 'restringido' | 'experimental' | 'no_disponible';

export interface ModelRegistry {
  model_id: string;
  provider: string;
  /** Ruta del modelo soportado; no hardcodear catálogos inmóviles (§09). */
  provider_model_id: string;
  nombre: string;
  media_type: MediaType;
  capabilities: Record<string, unknown>;
  duracion_min_s: number | null;
  duracion_max_s: number | null;
  ratios: string[] | null;
  quote_creditos: number;
  status: EstadoModelo;
  created_at: string;
}

/**
 * Máquina de estados del job (§09):
 * created → quoted → credits_reserved → queued → processing →
 * completed / failed / canceled
 */
export type EstadoGeneracion =
  | 'created'
  | 'quoted'
  | 'credits_reserved'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

export type ModoGeneracion = 'facil' | 'pro';

export interface GenerationJob {
  generation_id: string;
  organization_id: string;
  property_id: string | null;
  template_id: string | null;
  model_id: string;
  modo: ModoGeneracion;
  prompt: string;
  parametros: Record<string, unknown>;
  status: EstadoGeneracion;
  credits_cost: number;
  provider_request_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationOutput {
  output_id: string;
  generation_id: string;
  organization_id: string;
  url: string;
  tipo: MediaType;
  /** Indica si el resultado es un render conceptual (etiquetable en UI). */
  es_conceptual: boolean;
  version: number;
  created_at: string;
}
