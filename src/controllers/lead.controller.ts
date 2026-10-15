// controllers/lead.controller.ts
// Leads captados por campañas (§11: origen, campaña, propiedad, deduplicación).

import { createCrudRouter } from '../core/crud.factory';
import { leadRequest } from '../requests/lead.request';
import { leadResource } from '../resources/lead.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByOrg, assignOrgOnCreate } from '../middlewares/tenantScope';
import { writeByMarketing } from '../middlewares/requireRole';

export const { router: leadRouter } = createCrudRouter({
  table: 'leads',
  primaryKey: 'lead_id',
  request: leadRequest,
  resource: leadResource,
  entityName: 'Lead',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByMarketing, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});
