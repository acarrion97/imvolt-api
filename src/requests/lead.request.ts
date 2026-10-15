// requests/lead.request.ts
// Validaciones de leads (prospectos captados).

import Joi from 'joi';
import { BaseRequest } from '../core/base.request';

const uuid = Joi.string().uuid({ version: 'uuidv4' });

const leadCreate = Joi.object({
  lead_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  campaign_id: uuid.allow(null).optional(),
  property_id: uuid.allow(null).optional(),
  nombre: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().allow(null, '').optional(),
  telefono: Joi.string().trim().max(30).allow(null, '').optional(),
  fuente: Joi.string().valid('meta_formulario', 'whatsapp', 'landing', 'manual', 'lotes_al_mando').required(),
  estado: Joi.string().valid('nuevo', 'contactado', 'calificado', 'visitado', 'cerrado', 'perdido').default('nuevo'),
  notas: Joi.string().trim().max(2000).allow(null, '').optional(),
  provider_lead_id: Joi.string().trim().max(120).allow(null, '').optional(),
});

export const leadRequest = new BaseRequest({
  create: leadCreate,
  update: leadCreate.fork(['nombre', 'fuente'], (s) => s.optional()).min(1),
});
