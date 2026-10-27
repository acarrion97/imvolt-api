// resources/leads.resource.ts
// Vistas de respuesta del módulo Leads.
//
// `contacto` incrusta la propiedad consultada como subobjeto (null si el lead
// llegó sin propiedad asociada).

import { BaseResource } from '../core/base.resource';
import { ContactoView } from '../models/leads/contacto.model';
import { LeadView } from '../models/leads/lead.model';
import { propiedadResource } from './property.resource';

export const leadResource = new BaseResource<any, LeadView>((row) => ({
  lead_id: String(row.contacto_id),
  organization_id: row.empresa_id == null ? null : String(row.empresa_id),
  campaign_id: row.campania_id == null ? null : String(row.campania_id),
  property_id: row.propiedad_id == null ? null : String(row.propiedad_id),
  nombre: [row.nombres, row.apellidos].filter(Boolean).join(' '),
  email: row.correo ?? null,
  telefono: row.telefono ?? null,
  fuente: row.origen,
  estado: row.etapa,
  notas: row.notas ?? null,
  provider_lead_id: row.referencia_externa ?? null,
  created_at: new Date(row.creado_en).toISOString(),
}));

export const contactoResource = new BaseResource<any, ContactoView>((row) => ({
  contacto_id: row.contacto_id,
  nombres: row.nombres,
  apellidos: row.apellidos,
  correo: row.correo,
  telefono: row.telefono,
  origen: row.origen,
  propiedad_id: row.propiedad_id ?? null,
  empresa_id: row.empresa_id ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjeto FK: la tabla incrustada llega como `propiedades`.
  propiedad: row.propiedades ? propiedadResource.format(row.propiedades) : null,
}));
