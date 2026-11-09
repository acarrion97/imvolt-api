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
import { BaseService } from '../core/base.service';
import { AuditContext } from '../services/audit.service';
import { errorResponse, HttpError } from '../core/errors';
import supabase from '../config/supabaseClient';
import { retryFailedConversion, sendLeadConversion } from '../services/meta-leads.service';

class LeadService extends BaseService {
  override async update<U = any>(
    id: string | number,
    payload: Partial<U>,
    audit?: AuditContext,
  ): Promise<U> {
    const before = await this.getById<Record<string, unknown>>(id);
    const updated = await super.update<U>(id, payload, audit);
    const nextStage = (payload as Record<string, unknown>).etapa;
    if (
      audit?.empresaId &&
      nextStage !== before.etapa &&
      (nextStage === 'visitado' || nextStage === 'cerrado')
    ) {
      await sendLeadConversion(audit.empresaId, id);
    }
    return updated;
  }
}

const leadFields = {
  property_id: 'propiedad_id',
  campaign_id: 'campania_id',
  fuente: 'origen',
  estado: 'etapa',
  email: 'correo',
  provider_lead_id: 'referencia_externa',
};

export const { router: leadRouter } = createCrudRouter({
  service: new LeadService('contactos', 'contacto_id'),
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
  extraRoutes: (router) => {
    router.post('/:id/retry-meta-conversion', ...requireOrg, writeByMarketing, async (req, res) => {
      try {
        const contactId = Number(req.params.id);
        if (!Number.isSafeInteger(contactId) || contactId <= 0 || !req.organizationId) {
          throw new HttpError(400, 'Identificador de prospecto inválido.');
        }
        const { data: contact, error } = await supabase
          .from('contactos')
          .select('contacto_id')
          .eq('contacto_id', contactId)
          .eq('empresa_id', Number(req.organizationId))
          .maybeSingle();
        if (error) throw new HttpError(503, 'No se pudo consultar el prospecto.');
        if (!contact) throw new HttpError(404, 'Prospecto no encontrado.');
        await retryFailedConversion(req.organizationId, contactId);
        res.json({ message: 'Evento de conversión reenviado a Meta.' });
      } catch (error) {
        const { status, body } = errorResponse(error);
        res.status(status).json(body);
      }
    });
  },
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
