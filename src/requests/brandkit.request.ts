// requests/brandkit.request.ts
// Validaciones del módulo Brand Kit: archivos de marca con versiones y
// paleta de colores de la empresa.
//
// Los metadatos de un archivo (nombre, categoría, descripción) se validan
// aquí; el BLOB del archivo viaja por multipart y lo valida el storage
// service (tamaño, MIME) antes de subirlo al bucket.

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';
import { CATEGORIAS_ASSET } from '../models/brandkit/brand_asset.model';
import { USOS_COLOR } from '../models/brandkit/brand_color.model';

// ── Archivos del Brand Kit (metadatos; el blob va por multipart) ────────────
const brandAssetShape = {
  nombre: Joi.string().min(3).max(80).description('Nombre del archivo de marca (p. ej. "Logo horizontal principal")'),
  categoria: Joi.string()
    .valid(...CATEGORIAS_ASSET)
    .description('Categoría del archivo dentro de la identidad'),
  descripcion: Joi.string().max(500).allow(null, '').description('Notas de uso del archivo'),
  empresa_id: fk().description('Empresa propietaria del archivo'),
};

export const brandAssetRequest = new BaseRequest(
  buildSchemas(brandAssetShape, {
    required: ['nombre', 'categoria'],
    defaults: { categoria: 'logo_horizontal' },
  })
);

// ── Colores de la paleta ────────────────────────────────────────────────────
// El hex se valida con el patrón #RRGGBB (mayúsculas o minúsculas).
const brandColorShape = {
  nombre: Joi.string().min(2).max(50).description('Nombre del color (p. ej. "Verde IMVOLT")'),
  hex: Joi.string()
    .pattern(/^#[0-9A-Fa-f]{6}$/)
    .message('"hex" debe ser un color hexadecimal con formato #RRGGBB')
    .description('Código hexadecimal del color'),
  uso: Joi.string()
    .valid(...USOS_COLOR)
    .description('Rol del color dentro de la identidad'),
  orden: Joi.number().integer().min(0).max(999).description('Orden de presentación en la paleta'),
  empresa_id: fk().description('Empresa propietaria del color'),
};

export const brandColorRequest = new BaseRequest(
  buildSchemas(brandColorShape, {
    required: ['nombre', 'hex'],
    defaults: { uso: 'principal', orden: 0 },
  })
);
