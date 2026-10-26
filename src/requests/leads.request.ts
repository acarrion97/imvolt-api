// requests/leads.request.ts
// Validaciones del módulo Leads: contactos captados por campañas o formularios.

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';

const ORIGENES = ['meta_formulario', 'whatsapp', 'landing', 'manual', 'referido'] as const;

const contactoShape = {
  nombres: Joi.string().min(2).max(30).description('Nombres del contacto'),
  apellidos: Joi.string().min(2).max(30).description('Apellidos del contacto'),
  correo: Joi.string().email().description('Correo electrónico'),
  telefono: Joi.string().max(13).description('Teléfono / WhatsApp'),
  origen: Joi.string().valid(...ORIGENES).description('Canal por el que llegó el contacto'),
  propiedad_id: fk().allow(null).description('Propiedad por la que preguntó (si aplica)'),
  empresa_id: fk().description('Empresa dueña del contacto (la fija el API desde la sesión)'),
};

export const contactoRequest = new BaseRequest(
  buildSchemas(contactoShape, { required: ['nombres', 'apellidos', 'correo', 'telefono', 'origen'] })
);
