// controllers/leads.controller.ts
// CRUD del módulo Leads (IMVOLT Pulse): contactos captados por campañas,
// formularios o registro manual.

import { createCrudRouter } from '../core/crud.factory';
import { leadRequest, splitLeadName } from '../requests/leads.request';
import { contactoRequest } from '../requests/leads.request';
import { contactoResource, leadResource } from '../resources/leads.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing } from '../middlewares/requireRole';
import { filterByEmpresa, forceEmpresa, requireOwnedRef } from '../middlewares/tenantScope';
import { translateBody, translateQuery } from '../middlewares/contract';

const leadFields = {
  property_id: 'propiedad_id',
  campaign_id: 'campania_id',
  fuente: 'origen',
  estado: 'etapa',
  email: 'correo',
  provider_lead_id: 'referencia_externa',
};

export const { router: leadRouter } = createCrudRouter({
  table: 'contactos',
  primaryKey: 'contacto_id',
  request: leadRequest,
  resource: leadResource,
  entityName: 'Lead',
  middlewares: [...requireOrg, filterByEmpresa, translateQuery(leadFields)],
  writeMiddlewares: [
    writeByMarketing,
    translateBody(leadFields),
    splitLeadName,
    forceEmpresa,
    requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id'),
    requireOwnedRef('campania_id', 'campanias_publicitarias', 'campania_publicitaria_id'),
  ],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});

// Contrato heredado del diagrama, conservado para /v1/contactos.
export const { router: contactoRouter } = createCrudRouter({
  table: 'contactos',
  primaryKey: 'contacto_id',
  joins: ['propiedades(*, empresas(*), tipos_propiedades(*))'],
  request: contactoRequest,
  resource: contactoResource,
  entityName: 'Contacto',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByMarketing, forceEmpresa, requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id')],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // Un contacto puede no tener propiedad: el tenant va en su propia columna
  // `empresa_id` (ver database/migrations), no se deduce de la propiedad.
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});
