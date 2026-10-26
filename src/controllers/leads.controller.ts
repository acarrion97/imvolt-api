// controllers/leads.controller.ts
// CRUD del módulo Leads (IMVOLT Pulse): contactos captados por campañas,
// formularios o registro manual.

import { createCrudRouter } from '../core/crud.factory';
import { contactoRequest } from '../requests/leads.request';
import { contactoResource } from '../resources/leads.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing } from '../middlewares/requireRole';
import { filterByEmpresa, forceEmpresa, requireOwnedRef } from '../middlewares/tenantScope';

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
