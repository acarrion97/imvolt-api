// models/lead.model.ts
// Prospectos captados por campañas (IMVOLT Pulse / contacto).
// Documento maestro §11 (leads y trazabilidad).

export type FuenteLead = 'meta_formulario' | 'whatsapp' | 'landing' | 'manual' | 'lotes_al_mando';

export type EstadoLead =
  | 'nuevo'
  | 'contactado'
  | 'calificado'
  | 'visitado'
  | 'cerrado'
  | 'perdido';

export interface Lead {
  lead_id: string;
  organization_id: string;
  campaign_id: string | null;
  property_id: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  fuente: FuenteLead;
  estado: EstadoLead;
  notas: string | null;
  /** ID del proveedor para deduplicar (§11). */
  provider_lead_id: string | null;
  created_at: string;
}
