import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, estado } from './helpers';

const planShape = {
  nombre: Joi.string().min(2).max(60),
  descripcion: Joi.string().allow('').max(300),
  precio_mensual: Joi.number().min(0).precision(2),
  limite_usuarios: Joi.number().integer().min(1),
  creditos_mensuales: Joi.number().integer().min(0),
  caracteristicas: Joi.array().items(Joi.string().trim().min(1).max(100)).max(12),
  estado: estado(),
};

export const planRequest = new BaseRequest(
  buildSchemas(planShape, {
    required: ['nombre', 'descripcion', 'precio_mensual', 'limite_usuarios', 'creditos_mensuales'],
    defaults: { descripcion: '', precio_mensual: 0, limite_usuarios: 1, creditos_mensuales: 0, caracteristicas: [], estado: 'activo' },
  }),
);

const configuracionSistemaShape = {
  clave: Joi.string().pattern(/^[a-z][a-z0-9_]{1,59}$/),
  valor: Joi.string().max(1000),
  tipo: Joi.string().valid('texto', 'numero', 'booleano'),
  descripcion: Joi.string().allow('').max(180),
};

export const configuracionSistemaRequest = new BaseRequest(
  buildSchemas(configuracionSistemaShape, {
    required: ['clave', 'valor', 'tipo', 'descripcion'],
  }),
);
