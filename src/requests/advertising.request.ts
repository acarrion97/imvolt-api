// requests/advertising.request.ts
// Validaciones del módulo Publicidad: conexiones (Meta), objetivos de
// campaña y campañas publicitarias (borrador local antes de publicarse en Meta).
//
// Nombres de contrato del frontend (camelCase / español) → columnas reales:
// los renombra `translateBody` antes de llegar a Joi:
//   connection_id → conexion_id, property_id → propiedad_id,
//   estado → estado_flujo, presupuesto_maximo → presupuesto_diario,
//   copy → copy_anuncio, objetivo → objetivo_publicidad_id (resolver asíncrono).

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, estado, fk, id } from './helpers';

// ── Conexiones a plataformas externas ───────────────────────────────────────
const conexionShape = {
  cuenta_publicitaria_id: Joi.string().min(1).max(100).description('ID de la cuenta publicitaria de Meta'),
  nombre_cuenta: Joi.string().min(1).max(120).description('Nombre visible de la cuenta'),
  estado: Joi.string().valid('pendiente', 'conectada', 'revocada').default('pendiente'),
  permisos: Joi.object().allow(null).optional(),
  empresa_id: fk().description('Empresa dueña de la conexión (la fija el API desde la sesión)'),
};

export const conexionRequest = new BaseRequest(
  buildSchemas(conexionShape, { required: ['cuenta_publicitaria_id', 'nombre_cuenta'], defaults: { estado: 'pendiente' } })
);

// ── Objetivos de publicidad ─────────────────────────────────────────────────
const objetivoPublicidadShape = {
  nombre: Joi.string().min(3).max(30).description('Objetivo de la campaña (p. ej. mensajes, formularios, visitas)'),
};

export const objetivoPublicidadRequest = new BaseRequest(
  buildSchemas(objetivoPublicidadShape, { required: ['nombre'] })
);

// ── Campañas publicitarias ──────────────────────────────────────────────────
// Estado del pipeline §10. No confundir con la liveness `estado` de la tabla.
export const ESTADOS_FLUJO = [
  'local_draft',
  'validated',
  'awaiting_approval',
  'approved',
  'published_paused',
  'active',
  'rejected',
  'failed',
  'archived',
] as const;

const campaniaShape = {
  empresa_id: fk().description('Empresa dueña de la campaña (la fija el API desde la sesión)'),
  nombre: Joi.string().min(3).max(120).description('Nombre interno de la campaña'),
  propiedad_id: fk().optional().description('Propiedad que se promociona'),
  conexion_id: fk().optional().description('Conexión Meta usada para publicar'),
  objetivo_publicidad_id: fk().optional().description('Objetivo de la campaña (viene como `objetivo`: nombre)'),
  estado_flujo: Joi.string().valid(...ESTADOS_FLUJO).default('local_draft').description('Etapa del pipeline de la campaña'),
  destino: Joi.string().valid('whatsapp', 'formulario', 'landing').default('landing').description('Destino del anuncio'),
  presupuesto_diario: Joi.number().positive().precision(2).description('Presupuesto diario máximo (viene como `presupuesto_maximo`)'),
  moneda: Joi.string().length(3).uppercase().default('USD').description('Moneda del presupuesto'),
  fecha_inicio: Joi.date().optional().description('Inicio planificado (ISO)'),
  fecha_fin: Joi.date().optional().description('Fin planificado (ISO)'),
  duracion_dias: Joi.number().positive().precision(2).optional().description('Duración planificada en días (calculable)'),
  titulo: Joi.string().max(120).optional().description('Título del anuncio'),
  copy_anuncio: Joi.string().min(10).max(500).optional().allow(null).description('Texto del anuncio (viene como `copy`)'),
  cta: Joi.string().max(60).optional().allow(null).description('Call to action del anuncio'),
  creative_url: Joi.string().uri({ allowRelative: true }).optional().allow(null).description('URL del creativo generado'),
};

const campaignSchemas = buildSchemas(campaniaShape, {
  required: ['nombre', 'objetivo_publicidad_id', 'presupuesto_diario', 'copy_anuncio'],
  defaults: { estado_flujo: 'local_draft', destino: 'landing', moneda: 'USD' },
});
export const campaignRequest = new BaseRequest(campaignSchemas);

// Contrato heredado de /v1/campanias-publicitarias (tabla/diagrama español).
// Se mantiene separado del adaptador nuevo /v1/campaigns.
const legacyCampaniaShape = {
  propiedad_id: fk(),
  objetivo_publicidad_id: fk(),
  presupuesto_diario: Joi.number().positive().precision(2),
  duracion_dias: Joi.number().positive().precision(2),
  zona_referencia: Joi.string().max(50),
  copy_anuncio: Joi.string().min(10).max(500),
};
export const campaniaPublicitariaRequest = new BaseRequest(
  buildSchemas(legacyCampaniaShape, {
    required: ['propiedad_id', 'objetivo_publicidad_id', 'presupuesto_diario', 'duracion_dias', 'zona_referencia', 'copy_anuncio'],
  })
);
export { id as campaignId, estado as campaignEstado };
