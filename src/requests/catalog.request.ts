// requests/catalog.request.ts
// Validaciones del catálogo inmobiliario: proyectos, propiedades, medios y brand kit.

import Joi from 'joi';
import { BaseRequest } from '../core/base.request';

const uuid = Joi.string().uuid({ version: 'uuidv4' });

// ── Proyectos ───────────────────────────────────────────────────────────────
const proyectoCreate = Joi.object({
  project_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  nombre: Joi.string().trim().min(2).max(120).required(),
  tipo: Joi.string().valid('lotizacion', 'urbanizacion', 'edificio', 'proyecto_planos', 'individual').required(),
  descripcion: Joi.string().trim().max(2000).allow(null, '').optional(),
  ubicacion: Joi.string().trim().max(200).allow(null, '').optional(),
  total_lotes: Joi.number().integer().min(1).allow(null).optional(),
  estado: Joi.string().valid('activo', 'pausado', 'terminado').default('activo'),
});

export const proyectoRequest = new BaseRequest({
  create: proyectoCreate,
  update: proyectoCreate.fork(['nombre', 'tipo'], (s) => s.optional()).min(1),
});

// ── Propiedades ─────────────────────────────────────────────────────────────
const propiedadCreate = Joi.object({
  property_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  project_id: uuid.allow(null).optional(),
  nombre: Joi.string().trim().min(2).max(120).required(),
  categoria: Joi.string().valid('lote', 'casa', 'departamento', 'oficina', 'local', 'proyecto').required(),
  titulo_publicacion: Joi.string().trim().max(160).allow(null, '').optional(),
  descripcion: Joi.string().trim().max(4000).allow(null, '').optional(),
  precio: Joi.number().min(0).allow(null).optional(),
  moneda: Joi.string().trim().length(3).default('USD'),
  superficie_m2: Joi.number().min(0).allow(null).optional(),
  habitaciones: Joi.number().integer().min(0).allow(null).optional(),
  banos: Joi.number().integer().min(0).allow(null).optional(),
  estacionamientos: Joi.number().integer().min(0).allow(null).optional(),
  direccion: Joi.string().trim().max(200).allow(null, '').optional(),
  ciudad: Joi.string().trim().max(80).allow(null, '').optional(),
  pais: Joi.string().trim().max(60).default('Ecuador'),
  estado: Joi.string().valid('disponible', 'reservada', 'vendida', 'no_disponible').default('disponible'),
  tiene_render_conceptual: Joi.boolean().default(false),
});

export const propiedadRequest = new BaseRequest({
  create: propiedadCreate,
  update: propiedadCreate.fork(['nombre', 'categoria'], (s) => s.optional()).min(1),
});

// ── Medios ──────────────────────────────────────────────────────────────────
const mediaCreate = Joi.object({
  media_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  property_id: uuid.allow(null).optional(),
  tipo: Joi.string().valid('foto', 'render', 'video', 'plano', 'documento').required(),
  nombre: Joi.string().trim().min(2).max(120).required(),
  url: Joi.string().uri({ allowRelative: false }).required(),
  es_referencia_original: Joi.boolean().default(false),
});

export const mediaRequest = new BaseRequest({
  create: mediaCreate,
  update: mediaCreate.fork(['tipo', 'nombre', 'url'], (s) => s.optional()).min(1),
});

// ── Brand kit ───────────────────────────────────────────────────────────────
const brandKitCreate = Joi.object({
  brand_kit_id: uuid.optional(),
  organization_id: uuid.optional(), // inyectado por el middleware de tenant
  nombre: Joi.string().trim().min(2).max(120).required(),
  logo_url: Joi.string().uri().allow(null, '').optional(),
  color_primario: Joi.string().trim().max(20).allow(null, '').optional(),
  color_secundario: Joi.string().trim().max(20).allow(null, '').optional(),
  tipografia: Joi.string().trim().max(60).allow(null, '').optional(),
});

export const brandKitRequest = new BaseRequest({
  create: brandKitCreate,
  update: brandKitCreate.fork(['nombre'], (s) => s.optional()).min(1),
});
