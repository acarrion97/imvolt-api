// requests/creative.request.ts
// Validaciones del módulo Creative: tipos de plantilla, plantillas, formatos,
// enfoques comerciales y contenidos generados con IA.

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';
import { ModeloMediaType } from '../models/creative/modelo_ia.model';

// ── Tipos de plantilla ──────────────────────────────────────────────────────
const tipoPlantillaShape = {
  nombre: Joi.string().min(3).max(50).description('Categoría de la plantilla (p. ej. terrenos, vivienda, comercial)'),
  descripcion: Joi.string().max(500).description('Qué representa esta categoría'),
};

export const tipoPlantillaRequest = new BaseRequest(
  buildSchemas(tipoPlantillaShape, { required: ['nombre', 'descripcion'] })
);

// ── Plantillas ──────────────────────────────────────────────────────────────
const plantillaShape = {
  nombre: Joi.string().min(3).max(50).description('Nombre de la plantilla creativa'),
  descripcion: Joi.string().max(500).allow(null, '').description('Qué produce la plantilla'),
  url_logo: Joi.string().uri({ allowRelative: false }).max(200).allow(null, '').description('Logo aplicado a la pieza'),
  tipo_plantilla_id: fk().description('Categoría de la plantilla'),
};

export const plantillaRequest = new BaseRequest(
  buildSchemas(plantillaShape, { required: ['nombre', 'tipo_plantilla_id'] })
);

// ── Formatos ────────────────────────────────────────────────────────────────
const formatoShape = {
  nombre: Joi.string().min(2).max(50).description('Nombre del formato (p. ej. 9:16 Reels, 1:1 Feed)'),
  descripcion: Joi.string().max(500).allow(null, '').description('Uso recomendado del formato'),
};

export const formatoRequest = new BaseRequest(
  buildSchemas(formatoShape, { required: ['nombre'] })
);

// ── Enfoques comerciales ────────────────────────────────────────────────────
const enfoqueComercialShape = {
  nombre: Joi.string().min(3).max(50).description('Ángulo de venta (p. ej. inversión, primer hogar, exclusividad)'),
  descripcion: Joi.string().max(500).allow(null, '').description('Cuándo usar este enfoque'),
};

export const enfoqueComercialRequest = new BaseRequest(
  buildSchemas(enfoqueComercialShape, { required: ['nombre'] })
);

// ── Contenidos IA ───────────────────────────────────────────────────────────
const contenidoIaShape = {
  propiedad_id: fk().description('Propiedad promocionada'),
  plantilla_id: fk().description('Plantilla creativa usada'),
  formato_id: fk().description('Formato de salida'),
  duracion: Joi.string().max(20).description('Duración solicitada (p. ej. "8 s"; vacío para imagen)'),
  enfoque_comercial_id: fk().description('Enfoque comercial aplicado'),
  url_imagen_referencia: Joi.string().uri({ allowRelative: false }).max(500).allow(null, '').description('Imagen de referencia que la IA debe preservar'),
};

export const contenidoIaRequest = new BaseRequest(
  buildSchemas(contenidoIaShape, { required: ['propiedad_id', 'plantilla_id', 'formato_id', 'duracion', 'enfoque_comercial_id'] })
);

// ── Catálogo vivo de modelos IA ────────────────────────────────────────────
const modeloIaShape = {
  proveedor: Joi.string().max(50),
  modelo_proveedor_id: Joi.string().max(120),
  nombre: Joi.string().min(2).max(120),
  tipo_media: Joi.string().valid('image', 'video'),
  capacidades: Joi.object().unknown(true),
  duracion_min_s: Joi.number().integer().positive().allow(null),
  duracion_max_s: Joi.number().integer().positive().allow(null),
  ratios: Joi.array().items(Joi.string()).allow(null),
  creditos_cotizacion: Joi.number().integer().min(0),
  estado: Joi.string().valid('activo', 'inactivo', 'no_disponible'),
};

export const modeloRequest = new BaseRequest(
  buildSchemas(modeloIaShape, { required: ['proveedor', 'modelo_proveedor_id', 'nombre', 'tipo_media'] })
);

// ── Jobs de generación IA ──────────────────────────────────────────────────
const generacionShape = {
  empresa_id: fk(),
  propiedad_id: fk().allow(null),
  plantilla_id: fk().allow(null),
  modelo_id: fk(),
  modo: Joi.string().valid('facil', 'pro').default('facil'),
  prompt: Joi.string().min(1).max(10000),
  parametros: Joi.object().unknown(true).default({}),
};

export const generacionRequest = new BaseRequest(
  buildSchemas(generacionShape, { required: ['modelo_id', 'prompt'], defaults: { modo: 'facil', parametros: {} } })
);

export type GeneracionMediaType = ModeloMediaType;

// ── Recarga de créditos ────────────────────────────────────────────────────
const rechargeShape = {
  monto: Joi.number().integer().positive().max(1_000_000),
  idempotency_key: Joi.string().min(1).max(120).allow(null),
};

export const rechargeRequest = new BaseRequest(
  buildSchemas(rechargeShape, { required: ['monto'] })
);
