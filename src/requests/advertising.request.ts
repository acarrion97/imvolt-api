// requests/advertising.request.ts
// Validaciones del módulo Publicidad: objetivos de campaña y campañas
// publicitarias (borrador local antes de publicarse en Meta).

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';

// ── Objetivos de publicidad ─────────────────────────────────────────────────
const objetivoPublicidadShape = {
  nombre: Joi.string().min(3).max(30).description('Objetivo de la campaña (p. ej. mensajes, formularios, visitas)'),
};

export const objetivoPublicidadRequest = new BaseRequest(
  buildSchemas(objetivoPublicidadShape, { required: ['nombre'] })
);

// ── Campañas publicitarias ──────────────────────────────────────────────────
const campaniaPublicitariaShape = {
  propiedad_id: fk().description('Propiedad que se promociona'),
  objetivo_publicidad_id: fk().description('Objetivo de la campaña'),
  presupuesto_diario: Joi.number().positive().precision(2).description('Presupuesto diario máximo (en la moneda configurada)'),
  duracion_dias: Joi.number().positive().precision(2).description('Duración planificada de la campaña en días'),
  zona_referencia: Joi.string().max(50).description('Geocercas o zona de referencia para segmentar'),
  copy_anuncio: Joi.string().max(500).description('Texto del anuncio (sin promesas ni precios sin verificar)'),
};

export const campaniaPublicitariaRequest = new BaseRequest(
  buildSchemas(campaniaPublicitariaShape, {
    required: ['propiedad_id', 'objetivo_publicidad_id', 'presupuesto_diario', 'duracion_dias', 'zona_referencia', 'copy_anuncio'],
  })
);
