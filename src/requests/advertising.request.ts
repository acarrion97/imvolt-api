// requests/advertising.request.ts
// Validaciones de IMVOLT Ads: conexiones Meta y campañas.

import Joi from 'joi';
import { BaseRequest } from '../core/base.request';

const uuid = Joi.string().uuid({ version: 'uuidv4' });

// ── Conexiones Meta ─────────────────────────────────────────────────────────
const conexionCreate = Joi.object({
  connection_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  cuenta_publicitaria_id: Joi.string().trim().min(3).max(40).required(),
  nombre_cuenta: Joi.string().trim().min(2).max(120).required(),
  estado: Joi.string().valid('conectada', 'pendiente', 'revocada').default('pendiente'),
  permisos: Joi.array().items(Joi.string().trim().max(60)).allow(null).optional(),
});

export const conexionRequest = new BaseRequest({
  create: conexionCreate,
  update: conexionCreate.fork(['cuenta_publicitaria_id', 'nombre_cuenta'], (s) => s.optional()).min(1),
});

// ── Campañas ────────────────────────────────────────────────────────────────
const campanaCreate = Joi.object({
  campaign_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  connection_id: uuid.allow(null).optional(),
  property_id: uuid.allow(null).optional(),
  nombre: Joi.string().trim().min(3).max(120).required(),
  objetivo: Joi.string().valid('mensajes', 'formularios', 'visitas', 'trafico', 'branding').required(),
  destino: Joi.string().valid('whatsapp', 'formulario', 'landing').required(),
  presupuesto_maximo: Joi.number().min(1).required(),
  moneda: Joi.string().trim().length(3).default('USD'),
  fecha_inicio: Joi.date().iso().allow(null).optional(),
  fecha_fin: Joi.date().iso().allow(null).optional(),
  copy: Joi.string().trim().max(4000).allow(null, '').optional(),
  titulo: Joi.string().trim().max(120).allow(null, '').optional(),
  cta: Joi.string().trim().max(60).allow(null, '').optional(),
  creative_url: Joi.string().uri().allow(null, '').optional(),
});

export const campanaRequest = new BaseRequest({
  create: campanaCreate,
  update: campanaCreate.fork(['nombre', 'objetivo', 'destino', 'presupuesto_maximo'], (s) => s.optional()).min(1),
});

// ── Aprobaciones ────────────────────────────────────────────────────────────
export const aprobacionRequest = new BaseRequest({
  create: Joi.object({
    decision: Joi.string().valid('aprobada', 'rechazada').required(),
    comentario: Joi.string().trim().max(1000).allow(null, '').optional(),
  }),
});
