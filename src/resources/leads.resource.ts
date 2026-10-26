// resources/leads.resource.ts
// Vistas de respuesta del módulo Leads.
//
// `contacto` incrusta la propiedad consultada como subobjeto (null si el lead
// llegó sin propiedad asociada).

import { BaseResource } from '../core/base.resource';
import { ContactoView } from '../models/leads/contacto.model';
import { propiedadResource } from './property.resource';

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
