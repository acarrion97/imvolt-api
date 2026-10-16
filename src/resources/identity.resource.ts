// resources/identity.resource.ts
// Vistas de respuesta del módulo Identidad.
//
// Cada recurso con llaves foráneas incrusta además el subobjeto relacionado
// (el servicio lo trae con un JOIN PostgREST y aquí se renombra a singular):
// p. ej. `empresas` → `empresa`. Si la relación no se pudo resolver, va null.

import { BaseResource } from '../core/base.resource';
import { ConfiguracionIntegracionView } from '../models/identity/configuracion_integracion.model';
import { Empresa } from '../models/identity/empresa.model';
import { EmpresaHitoView } from '../models/identity/empresa_hito.model';
import { EmpresaIntegracionesView } from '../models/identity/empresa_integraciones.model';
import { HitoLanzamiento } from '../models/identity/hito_lanzamiento.model';
import { Integracion } from '../models/identity/integracion.model';
import { Permiso } from '../models/identity/permiso.model';
import { Rol } from '../models/identity/rol.model';
import { RolPermisoView } from '../models/identity/rol_permiso.model';
import { UsuarioRolView } from '../models/identity/usuario_rol.model';
import { UsuarioView } from '../models/identity/usuario.model';

export const empresaResource = new BaseResource<any, Empresa>((row) => ({
  empresa_id: row.empresa_id,
  razon_social: row.razon_social,
  ruc: row.ruc,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const usuarioResource = new BaseResource<any, UsuarioView>((row) => ({
  usuario_id: row.usuario_id,
  nombre: row.nombre,
  email: row.email,
  telefono: row.telefono ?? null,
  empresa_id: row.empresa_id,
  contrasenia_temporal_hasta: row.contrasenia_temporal_hasta ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjeto FK: la tabla incrustada llega como `empresas`.
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
}));

export const rolResource = new BaseResource<any, Rol>((row) => ({
  rol_id: row.rol_id,
  nombre: row.nombre,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const permisoResource = new BaseResource<any, Permiso>((row) => ({
  permiso_id: row.permiso_id,
  nombre: row.nombre,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const usuarioRolResource = new BaseResource<any, UsuarioRolView>((row) => ({
  usuario_rol_id: row.usuario_rol_id,
  usuario_id: row.usuario_id,
  rol_id: row.rol_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  usuario: row.usuarios ? usuarioResource.format(row.usuarios) : null,
  rol: row.roles ? rolResource.format(row.roles) : null,
}));

export const rolPermisoResource = new BaseResource<any, RolPermisoView>((row) => ({
  permiso_rol_id: row.permiso_rol_id,
  rol_id: row.rol_id,
  permiso_id: row.permiso_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  rol: row.roles ? rolResource.format(row.roles) : null,
  permiso: row.permisos ? permisoResource.format(row.permisos) : null,
}));

export const hitoLanzamientoResource = new BaseResource<any, HitoLanzamiento>((row) => ({
  hito_lanzamiento_id: row.hito_lanzamiento_id,
  nombre: row.nombre,
  descripcion: row.descripcion,
  orden: row.orden,
  obligatorio: row.obligatorio,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const empresaHitoResource = new BaseResource<any, EmpresaHitoView>((row) => ({
  empresa_hito_id: row.empresa_hito_id,
  empresa_id: row.empresa_id,
  hito_lanzamiento_id: row.hito_lanzamiento_id,
  observaciones: row.observaciones,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
  hito_lanzamiento: row.hitos_lanzamientos
    ? hitoLanzamientoResource.format(row.hitos_lanzamientos)
    : null,
}));

export const configuracionIntegracionResource = new BaseResource<any, ConfiguracionIntegracionView>((row) => ({
  configuracion_integracion_id: row.configuracion_integracion_id,
  url_base: row.url_base,
  // Las credenciales nunca salen completas: solo se expone la marca de que existen.
  api_key: row.api_key ? '••••' : null,
  entorno: row.entorno,
  api_id: row.api_id ?? null,
  app_secret: row.app_secret ? '••••' : null,
  access_token: row.access_token ? '••••' : null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const empresaIntegracionResource = new BaseResource<any, EmpresaIntegracionesView>((row) => ({
  empresa_integracion_id: row.empresa_integracion_id,
  empresa_id: row.empresa_id,
  integracion_id: row.integracion_id,
  configuracion_integracion_id: row.configuracion_integracion_id,
  referencia_credencial: row.referencia_credencial,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
  integracion: row.integraciones ? integracionResource.format(row.integraciones) : null,
  configuracion_integracion: row.configuraciones_integraciones
    ? configuracionIntegracionResource.format(row.configuraciones_integraciones)
    : null,
}));

/** Vista del catálogo de proveedores (tabla `integraciones`, sin CRUD propio). */
export const integracionResource = new BaseResource<any, Integracion>((row) => ({
  integracion_id: row.integracion_id,
  nombre: row.nombre,
  proveedor: row.proveedor ?? null,
  descripcion: row.descripcion ?? null,
  activa: row.activa,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));
