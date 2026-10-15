// requests/commerce.request.ts
// Validaciones de planes, suscripciones y créditos.

import Joi from 'joi';
import { BaseRequest } from '../core/base.request';

const uuid = Joi.string().uuid({ version: 'uuidv4' });

// ── Planes ──────────────────────────────────────────────────────────────────
const planCreate = Joi.object({
  plan_id: uuid.optional(),
  nombre: Joi.string().valid('agent', 'business', 'developer').required(),
  precio_mensual: Joi.number().min(0).required(),
  propiedades_max: Joi.number().integer().min(1).required(),
  usuarios_max: Joi.number().integer().min(1).required(),
  campanas_max: Joi.number().integer().min(1).required(),
  incluye_lotes_al_mando: Joi.boolean().default(false),
  analitica: Joi.string().valid('basica', 'intermedia', 'avanzada').default('basica'),
  activo: Joi.boolean().default(true),
});

export const planRequest = new BaseRequest({
  create: planCreate,
  update: planCreate.fork(['nombre'], (s) => s.optional()).min(1),
});

// ── Suscripciones ───────────────────────────────────────────────────────────
const suscripcionCreate = Joi.object({
  subscription_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  plan_id: uuid.required(),
  estado: Joi.string().valid('activa', 'pausada', 'vencida', 'cancelada').default('activa'),
  fecha_inicio: Joi.date().iso().default(() => new Date().toISOString()),
  fecha_fin: Joi.date().iso().allow(null).optional(),
});

export const suscripcionRequest = new BaseRequest({
  create: suscripcionCreate,
  update: suscripcionCreate.fork(['plan_id', 'estado'], (s) => s.optional()).min(1),
});

// ── Recarga de créditos ─────────────────────────────────────────────────────
export const recargaRequest = new BaseRequest({
  create: Joi.object({
    monto: Joi.number().integer().min(1).max(100000).required(),
    idempotency_key: Joi.string().trim().max(120).optional(),
  }),
});
