// models/advertising/campaign.model.ts
// Campaña publicitaria en el flujo de publicación §10, con el CONTRATO que
// consume el frontend en `/api/v1/campaigns`.
//
// Se sirve sobre `public.campanias_publicitarias` (una sola fuente de verdad):
//
//   campaign_id         → campania_publicitaria_id
//   organization_id     → empresa_id
//   connection_id       → conexion_id        (cuenta publicitaria de Meta)
//   property_id         → propiedad_id
//   objetivo            → objetivo_publicidad_id (catálogo, normalizado)
//   estado              → estado_flujo       (flujo §10)
//   presupuesto_maximo  → presupuesto_diario
//   copy                → copy_anuncio

/** Estados del flujo §10: local_draft → … → published_paused → active. */
export type CampaignEstado =
  | 'local_draft'
  | 'validated'
  | 'awaiting_approval'
  | 'approved'
  | 'published_paused'
  | 'active'
  | 'rejected'
  | 'failed'
  | 'archived';

export type CampaignObjetivo = 'mensajes' | 'formularios' | 'visitas' | 'trafico' | 'branding';

export type CampaignDestino = 'whatsapp' | 'formulario' | 'landing';

/** Fila de `public.campanias_publicitarias`. */
export interface Campaign {
  campania_publicitaria_id: number;
  empresa_id: number | null;
  conexion_id: number | null;
  propiedad_id: number | null;
  objetivo_publicidad_id: number;
  nombre: string | null;
  destino: CampaignDestino;
  presupuesto_diario: number;
  moneda: string;
  duracion_dias: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  zona_referencia: string | null;
  copy_anuncio: string;
  titulo: string | null;
  cta: string | null;
  creative_url: string | null;
  meta_campaign_id: string | null;
  meta_estado: string | null;
  estado: string;
  estado_flujo: CampaignEstado;
  creado_en: string;
  actualizado_en: string;
}

/** Vista del recurso `/v1/campaigns` (contrato del frontend). */
export interface CampaignView {
  campaign_id: string;
  organization_id: string | null;
  connection_id: string | null;
  property_id: string | null;
  nombre: string;
  objetivo: CampaignObjetivo | string;
  destino: CampaignDestino;
  estado: CampaignEstado;
  presupuesto_maximo: number;
  moneda: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  titulo: string | null;
  copy: string | null;
  cta: string | null;
  creative_url: string | null;
  meta_campaign_id: string | null;
  created_at: string;
  updated_at: string;
}
