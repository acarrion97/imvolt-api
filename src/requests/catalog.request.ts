// requests/catalog.request.ts
// Validaciones del módulo Catálogo: proyectos inmobiliarios y media assets.
// El BLOB del medio no pasa por aquí: se sube en multipart a
// `/media-assets/:id/versiones` y se valida en `services/media.storage.ts`
// (límite de 100 MB + MIME por categoría).

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';
import { TIPOS_PROYECTO } from '../models/catalog/proyecto.model';
import { CATEGORIAS_MEDIA } from '../models/catalog/media_asset.model';

// ── Proyectos ───────────────────────────────────────────────────────────────
const proyectoShape = {
  nombre: Joi.string().min(3).max(120).description('Nombre del desarrollo (p. ej. "Vista Hermosa")'),
  tipo: Joi.string()
    .valid(...TIPOS_PROYECTO)
    .description('Tipo de proyecto inmobiliario'),
  descripcion: Joi.string().max(1000).allow(null, '').description('Descripción del desarrollo'),
  ubicacion: Joi.string().max(500).allow(null, '').description('Ubicación de referencia del proyecto'),
  total_lotes: Joi.number().integer().min(1).allow(null).description('Total de lotes o unidades del desarrollo'),
  // Se inyecta desde la sesión (`assignEmpresaOnCreate`): el cliente nunca
  // decide a qué empresa pertenece el registro.
  empresa_id: fk().description('Empresa dueña del proyecto'),
};

export const proyectoRequest = new BaseRequest(
  buildSchemas(proyectoShape, {
    required: ['nombre', 'tipo'],
    defaults: { tipo: 'individual' },
  })
);

// ── Media assets (solo metadatos) ───────────────────────────────────────────
const mediaAssetShape = {
  nombre: Joi.string().min(3).max(80).description('Nombre visible del medio (p. ej. "Render fachada norte")'),
  categoria: Joi.string()
    .valid(...CATEGORIAS_MEDIA)
    .description('Categoría: define qué tipos de archivo se aceptan al subir'),
  descripcion: Joi.string().max(500).allow(null, '').description('Qué representa o para qué sirve el medio'),
  proyecto_id: fk().allow(null).description('Proyecto al que pertenece el medio (opcional)'),
  propiedad_id: fk().allow(null).description('Propiedad que promueve el medio (opcional)'),
  // Se inyecta desde la sesión (`empresaEnEscritura` del controlador).
  empresa_id: fk().description('Empresa dueña del medio'),
};

export const mediaAssetRequest = new BaseRequest(
  buildSchemas(mediaAssetShape, {
    required: ['nombre'],
    defaults: { categoria: 'imagen' },
  })
);
