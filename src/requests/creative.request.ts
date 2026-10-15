// requests/creative.request.ts
// Validaciones del Estudio IA: plantillas, registro de modelos y generaciones.

import Joi from 'joi';
import { BaseRequest } from '../core/base.request';

const uuid = Joi.string().uuid({ version: 'uuidv4' });

// ── Plantillas ──────────────────────────────────────────────────────────────
const plantillaCreate = Joi.object({
  template_id: uuid.optional(),
  organization_id: uuid.allow(null).optional(), // null = plantilla del sistema
  nombre: Joi.string().trim().min(3).max(120).required(),
  categoria: Joi.string()
    .valid('lotizaciones', 'casas', 'departamentos', 'proyecto_planos', 'publicidad_comercial', 'marca_inmobiliaria')
    .required(),
  objetivo: Joi.string().valid('visitas', 'mensajes', 'formularios', 'branding').required(),
  media_type: Joi.string().valid('image', 'video').required(),
  formato: Joi.string().valid('reels_9_16', 'imagen_4_5', 'feed_1_1', 'banner_16_9').required(),
  variables: Joi.array().items(Joi.string().trim().max(60)).default([]),
  estructura_narrativa: Joi.string().trim().max(1000).allow(null, '').optional(),
  movimiento_camara: Joi.string().trim().max(200).allow(null, '').optional(),
  estilo_visual: Joi.string().trim().max(200).allow(null, '').optional(),
  prompt_base: Joi.string().trim().min(10).max(4000).required(),
  requiere_referencia_original: Joi.boolean().default(false),
  creditos_base: Joi.number().min(0).default(1),
  activo: Joi.boolean().default(true),
});

export const plantillaRequest = new BaseRequest({
  create: plantillaCreate,
  update: plantillaCreate.fork(['nombre', 'categoria', 'objetivo', 'media_type', 'formato', 'prompt_base'], (s) =>
    s.optional(),
  ).min(1),
});

// ── Registro de modelos ─────────────────────────────────────────────────────
const modeloCreate = Joi.object({
  model_id: uuid.optional(),
  provider: Joi.string().trim().min(2).max(60).required(),
  provider_model_id: Joi.string().trim().min(2).max(160).required(),
  nombre: Joi.string().trim().min(2).max(120).required(),
  media_type: Joi.string().valid('image', 'video').required(),
  capabilities: Joi.object().unknown(true).default({}),
  duracion_min_s: Joi.number().min(1).allow(null).optional(),
  duracion_max_s: Joi.number().min(1).allow(null).optional(),
  ratios: Joi.array().items(Joi.string().trim().max(10)).allow(null).optional(),
  quote_creditos: Joi.number().min(0).default(1),
  status: Joi.string().valid('activo', 'restringido', 'experimental', 'no_disponible').default('activo'),
});

export const modeloRequest = new BaseRequest({
  create: modeloCreate,
  update: modeloCreate.fork(['provider', 'provider_model_id', 'nombre', 'media_type'], (s) => s.optional()).min(1),
});

// ── Generaciones (jobs IA) ──────────────────────────────────────────────────
const generacionCreate = Joi.object({
  property_id: uuid.allow(null).optional(),
  template_id: uuid.allow(null).optional(),
  model_id: uuid.required(),
  modo: Joi.string().valid('facil', 'pro').default('facil'),
  prompt: Joi.string().trim().min(10).max(6000).required(),
  parametros: Joi.object()
    .keys({
      duration: Joi.number().min(1).max(60).optional(),
      ratio: Joi.string().trim().max(10).optional(),
      resolution: Joi.string().trim().max(20).optional(),
      image_url: Joi.string().uri().optional(),
    })
    .unknown(true)
    .default({}),
  /** Clave de idempotencia para no duplicar cargos (§12). */
  idempotency_key: Joi.string().trim().max(120).optional(),
});

export const generacionRequest = new BaseRequest({ create: generacionCreate });

// ── Estratega (salida estructurada del asistente) ───────────────────────────
export const estrategaRequest = new BaseRequest({
  create: Joi.object({
    property_id: uuid.required(),
    objetivo: Joi.string().valid('visitas', 'mensajes', 'formularios', 'branding').default('mensajes'),
  }),
});
