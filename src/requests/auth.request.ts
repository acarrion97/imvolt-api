// requests/auth.request.ts
// Validaciones de las rutas de autenticación (`/api/auth`): registro y login.
//
// El registro crea cuenta + empresa + usuario + rol propietario, así que sus
// campos son más estrictos que los de un CRUD (contraseña mínima de 8
// caracteres y RUC de 13 dígitos cuando se envía).

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas } from './helpers';

const email = Joi.string().email().description('Correo de acceso');
const password = Joi.string()
  .min(8)
  .max(72)
  .description('Contraseña de la cuenta (mínimo 8 caracteres)');

// ── Registro (POST /api/auth/register) ─────────────────────────────────────
const registerShape = {
  email,
  password,
  nombres: Joi.string().min(2).max(60).description('Nombres de la persona'),
  apellidos: Joi.string().min(2).max(60).description('Apellidos de la persona'),
  telefono: Joi.string().allow(null, '').max(20).description('Teléfono / WhatsApp'),
  organization_name: Joi.string().min(3).max(120).description('Razón social de la empresa creada'),
  ruc: Joi.string()
    .pattern(/^\d{13}$/)
    .message('El RUC debe tener 13 dígitos')
    .allow('', null)
    .description('RUC (13 dígitos); puede completarse después'),
};

export const registerRequest = new BaseRequest(
  buildSchemas(registerShape, { required: ['email', 'password', 'nombres', 'apellidos', 'organization_name'] })
);

// ── Login (POST /api/auth/login) ───────────────────────────────────────────
const loginShape = { email, password: Joi.string().max(72).description('Contraseña de la cuenta') };

export const loginRequest = new BaseRequest(buildSchemas(loginShape, { required: ['email', 'password'] }));
