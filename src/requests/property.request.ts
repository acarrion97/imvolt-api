// requests/property.request.ts
// Validaciones del módulo Propiedades: catálogo de inmuebles y sus tipos.

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';

// ── Tipos de propiedad ──────────────────────────────────────────────────────
const tipoPropiedadShape = {
  nombre: Joi.string().min(3).max(30).description('Nombre del tipo (p. ej. lote, casa, departamento)'),
};

export const tipoPropiedadRequest = new BaseRequest(
  buildSchemas(tipoPropiedadShape, { required: ['nombre'] })
);

// ── Propiedades ─────────────────────────────────────────────────────────────
const propiedadShape = {
  nombre: Joi.string().min(3).max(50).description('Nombre comercial del inmueble'),
  ubicacion: Joi.string().max(500).description('Dirección o referencia de ubicación'),
  precio: Joi.number().positive().precision(2).description('Precio de referencia'),
  disponibilidad: Joi.string()
    .valid('disponible', 'reservada', 'vendida', 'no_disponible')
    .description('Estado comercial del inmueble'),
  descripcion: Joi.string().max(2000).description('Descripción verificable para publicaciones'),
  empresa_id: fk().description('Empresa propietaria del inmueble'),
  tipo_propiedad_id: fk().description('Tipo de propiedad asignado'),
  // Desarrollo al que pertenece el inmueble; null = propiedad individual.
  proyecto_id: fk().allow(null).description('Proyecto (desarrollo) al que pertenece la propiedad'),
};

export const propiedadRequest = new BaseRequest(
  buildSchemas(propiedadShape, {
    required: ['nombre', 'ubicacion', 'precio', 'disponibilidad', 'descripcion', 'empresa_id', 'tipo_propiedad_id'],
    defaults: { disponibilidad: 'disponible' },
  })
);
