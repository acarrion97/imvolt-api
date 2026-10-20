// requests/brandkit.request.ts
// Validaciones del módulo Brand Kit: archivos de marca (metadatos) y colores
// de la paleta. El BLOB del archivo no pasa por aquí: se sube en multipart a
// `/brand-assets/:id/versiones` y se valida en `services/brandkit.storage.ts`
// (límite de 10 MB + MIME por categoría).

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';
import { CATEGORIAS_ASSET } from '../models/brandkit/brand_asset.model';
import { USOS_COLOR } from '../models/brandkit/brand_color.model';

// ── Archivos de marca (solo metadatos) ──────────────────────────────────────
const brandAssetShape = {
  nombre: Joi.string().min(3).max(80).description('Nombre visible del archivo (p. ej. "Logo horizontal principal")'),
  categoria: Joi.string()
    .valid(...CATEGORIAS_ASSET)
    .description('Categoría: define qué tipos de archivo se aceptan al subir'),
  descripcion: Joi.string().max(500).allow(null, '').description('Para qué sirve este archivo en las piezas'),
  // Se inyecta desde la sesión (`empresaEnEscritura` del controlador): el
  // cliente nunca decide a qué empresa pertenece el registro.
  empresa_id: fk().description('Empresa dueña del archivo'),
};

const brandAssetSchemas = buildSchemas(brandAssetShape, {
  required: ['nombre', 'categoria'],
});

export const brandAssetRequest = new BaseRequest(brandAssetSchemas);

// ── Colores de la paleta ────────────────────────────────────────────────────
const brandColorShape = {
  nombre: Joi.string().min(2).max(50).description('Nombre del color (p. ej. "Verde IMVOLT")'),
  hex: Joi.string()
    .pattern(/^#[0-9A-Fa-f]{6}$/)
    .message('Usa el formato #RRGGBB (p. ej. #008E47)')
    .description('Código hexadecimal del color'),
  uso: Joi.string().valid(...USOS_COLOR).description('Rol del color dentro de la identidad'),
  orden: Joi.number().integer().min(0).max(999).description('Posición en la paleta'),
  empresa_id: fk().description('Empresa dueña del color'),
};

const brandColorSchemas = buildSchemas(brandColorShape, {
  required: ['nombre', 'hex'],
  defaults: { uso: 'principal', orden: 0 },
});

export const brandColorRequest = new BaseRequest(brandColorSchemas);
