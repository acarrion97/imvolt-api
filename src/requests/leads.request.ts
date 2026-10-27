// requests/leads.request.ts
// Validaciones del módulo Leads: contactos captados por campañas o formularios.

import Joi from 'joi';
import { RequestHandler } from 'express';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';

const ORIGENES = ['meta_formulario', 'whatsapp', 'landing', 'manual', 'lotes_al_mando'] as const;
const ETAPAS = ['nuevo', 'contactado', 'calificado', 'visitado', 'cerrado', 'perdido'] as const;

const contactoShape = {
  nombres: Joi.string().min(1).max(60).description('Nombres del contacto'),
  apellidos: Joi.string().allow('').max(60).description('Apellidos del contacto'),
  correo: Joi.string().email().allow(null, '').description('Correo electrónico'),
  telefono: Joi.string().max(20).allow(null, '').description('Teléfono / WhatsApp'),
  origen: Joi.string().valid(...ORIGENES).description('Canal por el que llegó el contacto'),
  propiedad_id: fk().allow(null).description('Propiedad por la que preguntó (si aplica)'),
  campania_id: fk().allow(null).description('Campaña asociada (si aplica)'),
  etapa: Joi.string().valid(...ETAPAS).description('Etapa comercial del lead'),
  notas: Joi.string().max(1000).allow(null, '').description('Notas de seguimiento'),
  referencia_externa: Joi.string().max(100).allow(null, '').description('ID del lead en el proveedor'),
  empresa_id: fk().description('Empresa dueña del contacto (la fija el API desde la sesión)'),
};

const schemas = buildSchemas(contactoShape, {
  required: ['nombres', 'apellidos', 'origen'],
  defaults: { etapa: 'nuevo' },
});
schemas.create = schemas.create.custom((value, helpers) =>
value.correo || value.telefono ? value : helpers.error('object.missing')
);
export const leadRequest = new BaseRequest(schemas);

const contactoLegacyShape = {
nombres: Joi.string().min(2).max(30),
apellidos: Joi.string().min(2).max(30),
correo: Joi.string().email(),
telefono: Joi.string().max(13),
origen: Joi.string().valid('meta_formulario', 'whatsapp', 'landing', 'manual', 'referido'),
propiedad_id: fk().allow(null),
};
export const contactoRequest = new BaseRequest(
buildSchemas(contactoLegacyShape, { required: ['nombres', 'apellidos', 'correo', 'telefono', 'origen'] })
);

/** Traduce el nombre completo del contrato REST a las dos columnas actuales. */
export const splitLeadName: RequestHandler = (req, _res, next) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body) {
    next();
    return;
  }
  if (typeof body.nombre === 'string' && body.nombres === undefined) {
    const nombre = body.nombre.trim();
    const separator = nombre.indexOf(' ');
    body.nombres = (separator < 0 ? nombre : nombre.slice(0, separator)).slice(0, 60);
    body.apellidos = (separator < 0 ? '' : nombre.slice(separator + 1).trim()).slice(0, 60);
  }
  delete body.nombre;
  for (const field of ['correo', 'telefono'] as const) {
    if (body[field] === '') body[field] = null;
  }
  next();
};
