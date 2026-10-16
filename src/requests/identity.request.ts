// requests/identity.request.ts
// Validaciones del módulo Identidad: empresas, usuarios, roles, permisos,
// asignaciones rol↔usuario y rol↔permiso, hitos de lanzamiento, integraciones
// y sus credenciales por empresa.

import Joi from 'joi';
import { BaseRequest } from '../core';
import { buildSchemas, fk } from './helpers';

// ── Empresas ────────────────────────────────────────────────────────────────
const empresaShape = {
  razon_social: Joi.string().min(3).max(120).description('Razón social de la empresa'),
  ruc: Joi.string().pattern(/^\d{13}$/).message('El RUC debe tener 13 dígitos').description('RUC (13 dígitos)'),
};

export const empresaRequest = new BaseRequest(buildSchemas(empresaShape, { required: ['razon_social', 'ruc'] }));

// ── Usuarios ────────────────────────────────────────────────────────────────
const usuarioShape = {
  nombre: Joi.string().min(2).max(120).description('Nombre completo del usuario'),
  email: Joi.string().email().description('Correo de acceso (único por usuario)'),
  telefono: Joi.string().allow(null, '').max(20).description('Teléfono / WhatsApp'),
  empresa_id: fk().description('Empresa a la que pertenece el usuario'),
  contrasenia_temporal_hasta: Joi.date().iso().allow(null).description('Vigencia de la contraseña temporal (ISO 8601)'),
};

export const usuarioRequest = new BaseRequest(
  buildSchemas(usuarioShape, { required: ['nombre', 'email', 'empresa_id'] })
);

// ── Roles ───────────────────────────────────────────────────────────────────
const rolShape = { nombre: Joi.string().min(3).max(30).description('Nombre del rol') };

export const rolRequest = new BaseRequest(buildSchemas(rolShape, { required: ['nombre'] }));

// ── Permisos ────────────────────────────────────────────────────────────────
const permisoShape = { nombre: Joi.string().min(3).max(60).description('Nombre del permiso') };

export const permisoRequest = new BaseRequest(buildSchemas(permisoShape, { required: ['nombre'] }));

// ── Roles ↔ Usuarios (tabla roles_usuarios) ─────────────────────────────────
const usuarioRolShape = {
  usuario_id: fk().description('Usuario al que se asigna el rol'),
  rol_id: fk().description('Rol asignado'),
};

export const usuarioRolRequest = new BaseRequest(
  buildSchemas(usuarioRolShape, { required: ['usuario_id', 'rol_id'] })
);

// ── Roles ↔ Permisos (tabla roles_permisos) ─────────────────────────────────
const rolPermisoShape = {
  rol_id: fk().description('Rol que recibe el permiso'),
  permiso_id: fk().description('Permiso concedido'),
};

export const rolPermisoRequest = new BaseRequest(
  buildSchemas(rolPermisoShape, { required: ['rol_id', 'permiso_id'] })
);

// ── Hitos de lanzamiento ────────────────────────────────────────────────────
const hitoLanzamientoShape = {
  nombre: Joi.string().min(3).max(60).description('Nombre del hito'),
  descripcion: Joi.string().max(500).description('Qué implica este hito'),
  orden: Joi.number().integer().min(0).description('Posición en el checklist de lanzamiento'),
  obligatorio: Joi.boolean().description('Si el hito debe completarse antes de publicar'),
};

export const hitoLanzamientoRequest = new BaseRequest(
  buildSchemas(hitoLanzamientoShape, { required: ['nombre', 'descripcion', 'orden', 'obligatorio'] })
);

// ── Hitos por empresa (tabla empresas_hitos) ────────────────────────────────
const empresaHitoShape = {
  empresa_id: fk().description('Empresa dueña del lanzamiento'),
  hito_lanzamiento_id: fk().description('Hito del catálogo'),
  observaciones: Joi.string().max(1000).description('Avance, evidencias o bloqueos del hito'),
};

export const empresaHitoRequest = new BaseRequest(
  buildSchemas(empresaHitoShape, { required: ['empresa_id', 'hito_lanzamiento_id', 'observaciones'] })
);

// ── Configuración de integración (credenciales) ─────────────────────────────
const configuracionIntegracionShape = {
  url_base: Joi.string().uri({ allowRelative: false }).max(200).description('URL base del proveedor'),
  api_key: Joi.string().max(200).description('Clave privada del proveedor (solo se guarda cifrada)'),
  entorno: Joi.string().max(20).description('Entorno de la integración (p. ej. sandbox / produccion)'),
  api_id: Joi.string().max(100).allow(null, '').description('ID de la aplicación del proveedor'),
  app_secret: Joi.string().max(200).allow(null, '').description('Secreto de aplicación del proveedor'),
  access_token: Joi.string().max(500).allow(null, '').description('Token de acceso vigente'),
};

export const configuracionIntegracionRequest = new BaseRequest(
  buildSchemas(configuracionIntegracionShape, { required: ['url_base', 'api_key', 'entorno'] })
);

// ── Integraciones por empresa (tabla empresas_integraciones) ────────────────
const empresaIntegracionShape = {
  empresa_id: fk().description('Empresa que usa la integración'),
  integracion_id: fk().description('Integración habilitada'),
  configuracion_integracion_id: fk().description('Credenciales utilizadas'),
  referencia_credencial: Joi.string().max(500).description('Referencia/alias humano de la credencial guardada'),
};

export const empresaIntegracionRequest = new BaseRequest(
  buildSchemas(empresaIntegracionShape, {
    required: ['empresa_id', 'integracion_id', 'configuracion_integracion_id', 'referencia_credencial'],
  })
);
