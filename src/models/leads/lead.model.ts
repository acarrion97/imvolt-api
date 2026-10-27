// models/leads/lead.model.ts
// Lead del pipeline comercial §11, con el CONTRATO que consume el frontend en
// `/api/v1/leads`. Se sirve sobre `public.contactos` (una sola fuente de
// verdad, igual que el módulo `/v1/contactos`):
//
//   lead_id          → contacto_id
//   organization_id  → empresa_id
//   campaign_id      → campania_id
//   property_id      → propiedad_id
//   nombre           → nombres + ' ' + apellidos
//   email            → correo        (opcional: el lead trae email O teléfono)
//   fuente           → origen
//   estado           → etapa         (nuevo → … → perdido; `estado` de la tabla
//                                     sigue siendo la vida lógica del registro)
//   provider_lead_id → referencia_externa (deduplicación §11)

export type LeadFuente = 'meta_formulario' | 'whatsapp' | 'landing' | 'manual' | 'lotes_al_mando';

export type LeadEstado = 'nuevo' | 'contactado' | 'calificado' | 'visitado' | 'cerrado' | 'perdido';

/** Fila de `public.contactos`. */
export interface Lead {
  contacto_id: number;
  empresa_id: number | null;
  campania_id: number | null;
  propiedad_id: number | null;
  nombres: string;
  apellidos: string;
  correo: string | null;
  telefono: string | null;
  origen: LeadFuente;
  notas: string | null;
  referencia_externa: string | null;
  etapa: LeadEstado;
  creado_en: string;
  actualizado_en: string;
}

/** Vista del recurso `/v1/leads` (contrato del frontend). */
export interface LeadView {
  lead_id: string;
  organization_id: string | null;
  campaign_id: string | null;
  property_id: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  fuente: LeadFuente;
  estado: LeadEstado;
  notas: string | null;
  provider_lead_id: string | null;
  created_at: string;
}
