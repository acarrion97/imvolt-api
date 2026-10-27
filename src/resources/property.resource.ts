// resources/property.resource.ts
// Vistas de respuesta del módulo Propiedades.
//
// `propiedad` incrusta sus dos llaves foráneas como subobjetos: `empresa`
// (tabla `empresas`) y `tipo_propiedad` (tabla `tipos_propiedades`).

import { BaseResource } from '../core/base.resource';
import { PropiedadView } from '../models/property/propiedad.model';
import { TipoPropiedad } from '../models/property/tipo_propiedad.model';
import { empresaResource } from './identity.resource';
import { proyectoReferenciaResource } from './catalog.resource';

export const tipoPropiedadResource = new BaseResource<any, TipoPropiedad>((row) => ({
  tipo_propiedad_id: row.tipo_propiedad_id,
  nombre: row.nombre,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const propiedadResource = new BaseResource<any, PropiedadView>((row) => ({
  propiedad_id: row.propiedad_id,
  nombre: row.nombre,
  ubicacion: row.ubicacion,
  precio: row.precio,
  disponibilidad: row.disponibilidad,
  descripcion: row.descripcion,
  medios_autorizados: Array.isArray(row.medios_autorizados) ? row.medios_autorizados : [],
  empresa_id: row.empresa_id,
  tipo_propiedad_id: row.tipo_propiedad_id,
  proyecto_id: row.proyecto_id ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjetos FK (las tablas incrustadas llegan en plural).
  empresa: row.empresas ? empresaResource.format(row.empresas) : null,
  tipo_propiedad: row.tipos_propiedades ? tipoPropiedadResource.format(row.tipos_propiedades) : null,
  // Null cuando la propiedad es individual (sin proyecto asignado).
  proyecto: row.proyectos ? proyectoReferenciaResource.format(row.proyectos) : null,
}));
