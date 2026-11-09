import Joi from 'joi';
import { BaseRequest } from '../core';
import { Plan } from '../models/platform-admin/plan.model';
import { buildSchemas, estado } from './helpers';

/**
 * Límites de uso: son las RESTRICCIONES que la API aplica antes de crear un
 * recurso (ver `services/plan-limits.service.ts`). `null` = sin límite.
 * `caracteristicas` ya no se recibe del cliente: se DERIVA de estos valores
 * para que el texto visible en la UI nunca se desincronice de lo que se valida.
 */
const LIMITES_PLAN = [
  { campo: 'limite_proyectos', singular: 'proyecto', plural: 'proyectos' },
  { campo: 'limite_imagenes_ia', singular: 'imagen IA', plural: 'imágenes IA' },
  { campo: 'limite_videos_ia', singular: 'video IA', plural: 'videos IA' },
  { campo: 'limite_campanias_meta', singular: 'campaña Meta', plural: 'campañas Meta' },
] as const;

const limitePlan = () =>
  Joi.number().integer().min(1).allow(null).description('Máximo permitido por el plan (NULL = sin límite)');

const planShape = {
  nombre: Joi.string().min(2).max(60),
  descripcion: Joi.string().allow('').max(300),
  precio_mensual: Joi.number().min(0).precision(2),
  limite_usuarios: Joi.number().integer().min(1),
  limite_proyectos: limitePlan(),
  limite_imagenes_ia: limitePlan(),
  limite_videos_ia: limitePlan(),
  limite_campanias_meta: limitePlan(),
  caracteristicas: Joi.array().items(Joi.string().trim().min(1).max(100)).max(12),
  estado: estado(),
};

/** Texto visible de los beneficios, generado desde los límites numéricos. */
function caracteristicasDesdeLimites(valores: unknown): string[] {
  const registro = (valores ?? {}) as Record<string, unknown>;
  return LIMITES_PLAN.flatMap(({ campo, singular, plural }) => {
    const valor = registro[campo];
    if (valor == null) return [];
    const cantidad = Number(valor);
    return [`${cantidad} ${cantidad === 1 ? singular : plural}`];
  });
}

class PlanRequest extends BaseRequest<Plan> {
  validateCreate(payload: unknown): Plan {
    const valores = super.validateCreate(payload);
    return { ...valores, caracteristicas: caracteristicasDesdeLimites(valores) };
  }

  /** PATCH parcial: solo se recalcula el texto si vienen TODOS los límites. */
  validateUpdate(payload: unknown): Partial<Plan> {
    const parcial = super.validateUpdate(payload);
    const completo = LIMITES_PLAN.every(({ campo }) => parcial[campo] !== undefined);
    if (!completo) {
      delete parcial.caracteristicas;
      return parcial;
    }
    return { ...parcial, caracteristicas: caracteristicasDesdeLimites(parcial) };
  }
}

export const planRequest = new PlanRequest(
  buildSchemas(planShape, {
    required: [
      'nombre',
      'descripcion',
      'precio_mensual',
      'limite_usuarios',
      'limite_proyectos',
      'limite_imagenes_ia',
      'limite_videos_ia',
      'limite_campanias_meta',
    ],
    defaults: {
      descripcion: '',
      precio_mensual: 0,
      limite_usuarios: 1,
      limite_proyectos: null,
      limite_imagenes_ia: null,
      limite_videos_ia: null,
      limite_campanias_meta: null,
      caracteristicas: [],
      estado: 'activo',
    },
  })
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
