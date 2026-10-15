// models/advertising.model.ts
// IMVOLT Ads: conexiones Meta, campañas, aprobaciones e insights.
// Documento maestro §10 (Meta Marketing API y máquina de estados).

export type EstadoConexion = 'conectada' | 'pendiente' | 'revocada';

export interface MetaConnection {
  connection_id: string;
  organization_id: string;
  cuenta_publicitaria_id: string;
  nombre_cuenta: string;
  estado: EstadoConexion;
  /** Permisos OAuth obtenidos (ads_management, leads, etc.). */
  permisos: string[] | null;
  created_at: string;
}

/**
 * Máquina de estados de campaña (§10):
 * local_draft → validated → awaiting_approval → approved →
 * published_paused → active. También: rejected / failed / archived.
 */
export type EstadoCampana =
  | 'local_draft'
  | 'validated'
  | 'awaiting_approval'
  | 'approved'
  | 'published_paused'
  | 'active'
  | 'rejected'
  | 'failed'
  | 'archived';

export type ObjetivoCampana = 'mensajes' | 'formularios' | 'visitas' | 'trafico' | 'branding';
export type DestinoCampana = 'whatsapp' | 'formulario' | 'landing';

export interface Campana {
  campaign_id: string;
  organization_id: string;
  connection_id: string | null;
  property_id: string | null;
  nombre: string;
  objetivo: ObjetivoCampana;
  destino: DestinoCampana;
  estado: EstadoCampana;
  presupuesto_maximo: number;
  moneda: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  copy: string | null;
  titulo: string | null;
  cta: string | null;
  creative_url: string | null;
  /** Meta devuelve el ID del recurso creado (en PAUSED). */
  meta_campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignApproval {
  approval_id: string;
  campaign_id: string;
  organization_id: string;
  aprobado_por: string;
  decision: 'aprobada' | 'rechazada';
  comentario: string | null;
  created_at: string;
}

export interface InsightsSnapshot {
  snapshot_id: string;
  campaign_id: string;
  organization_id: string;
  gasto: number;
  impresiones: number;
  clics: number;
  leads: number;
  alcance: number | null;
  tomado_en: string;
}
