// requests/identity.request.ts
// Validaciones de identidad: organizaciones (tenants), usuarios y membresías.

import Joi from 'joi';
import { BaseRequest } from '../core/base.request';

const uuid = Joi.string().uuid({ version: 'uuidv4' });
export const ORG_ROLES = ['propietario', 'administrador', 'marketing', 'agente', 'lector'];
const TIPOS_ORG = ['desarrollador', 'inmobiliaria', 'agente'];

const organizacionCreate = Joi.object({
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  nombre: Joi.string().trim().min(2).max(120).required(),
  tipo: Joi.string().valid(...TIPOS_ORG).required(),
  ruc: Joi.string().trim().max(20).allow(null, '').optional(),
  pais: Joi.string().trim().max(60).default('Ecuador'),
  activo: Joi.boolean().default(true),
});

export const organizacionRequest = new BaseRequest({
  create: organizacionCreate,
  update: organizacionCreate.fork(['nombre', 'tipo'], (s) => s.optional()).min(1),
});

const usuarioCreate = Joi.object({
  user_id: uuid.optional(),
  nombres: Joi.string().trim().min(2).max(80).required(),
  apellidos: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().required(),
  telefono: Joi.string().trim().max(20).allow(null, '').optional(),
  activo: Joi.boolean().default(true),
});

export const usuarioRequest = new BaseRequest({
  create: usuarioCreate,
  update: usuarioCreate.fork(['nombres', 'apellidos', 'email'], (s) => s.optional()).min(1),
});

const membresiaCreate = Joi.object({
  membership_id: uuid.optional(),
  user_id: uuid.required(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  rol: Joi.string().valid(...ORG_ROLES).required(),
  activo: Joi.boolean().default(true),
});

export const membresiaRequest = new BaseRequest({
  create: membresiaCreate,
  update: membresiaCreate.fork(['user_id', 'rol'], (s) => s.optional()).min(1),
});
