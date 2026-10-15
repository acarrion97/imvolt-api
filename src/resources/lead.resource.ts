// resources/lead.resource.ts
// Vista de leads.

import { BaseResource } from '../core/base.resource';

export const leadResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  lead_id: row.lead_id,
  organization_id: row.organization_id,
  campaign_id: row.campaign_id ?? null,
  property_id: row.property_id ?? null,
  nombre: row.nombre,
  email: row.email ?? null,
  telefono: row.telefono ?? null,
  fuente: row.fuente,
  estado: row.estado,
  notas: row.notas ?? null,
  provider_lead_id: row.provider_lead_id ?? null,
  created_at: row.created_at,
}));
