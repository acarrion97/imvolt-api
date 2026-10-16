// controllers/leads.controller.ts
// CRUD del módulo Leads (IMVOLT Pulse): contactos captados por campañas,
// formularios o registro manual.

import { createCrudRouter } from '../core/crud.factory';
import { contactoRequest } from '../requests/leads.request';
import { contactoResource } from '../resources/leads.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { writeByMarketing } from '../middlewares/requireRole';

export const { router: contactoRouter } = createCrudRouter({
  table: 'contactos',
  primaryKey: 'contacto_id',
  joins: ['propiedades(*, empresas(*), tipos_propiedades(*))'],
  request: contactoRequest,
  resource: contactoResource,
  entityName: 'Contacto',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByMarketing],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});
