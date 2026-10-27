// resources/creative.resource.ts
// Vistas de respuesta del módulo Creative.
//
// `plantilla` incrusta su tipo y `contenido_ia` incrusta sus cuatro relaciones
// (propiedad, plantilla, formato y enfoque comercial) como subobjetos.

import { BaseResource } from '../core/base.resource';
import { ContenidoIaView } from '../models/creative/contenido_ia.model';
import { EnfoqueComercial } from '../models/creative/enfoque_comercial.model';
import { Formato } from '../models/creative/formato.model';
import { PlantillaView } from '../models/creative/plantilla.model';
import { TipoPlantilla } from '../models/creative/tipo_plantilla.model';
import { ModeloIaView } from '../models/creative/modelo_ia.model';
import { GeneracionView } from '../models/creative/generacion.model';
import { propiedadResource } from './property.resource';

export const modeloResource = new BaseResource<any, ModeloIaView>((row) => ({
  model_id: String(row.modelo_id),
  provider: row.proveedor,
  provider_model_id: row.modelo_proveedor_id,
  nombre: row.nombre,
  media_type: row.tipo_media,
  capabilities: row.capacidades ?? {},
  duracion_min_s: row.duracion_min_s ?? null,
  duracion_max_s: row.duracion_max_s ?? null,
  ratios: row.ratios ?? null,
  quote_creditos: Number(row.creditos_cotizacion),
  status: row.estado,
  created_at: new Date(row.creado_en).toISOString(),
}));

export const generacionResource = new BaseResource<any, GeneracionView>((row) => ({
  generation_id: String(row.generacion_id),
  organization_id: row.empresa_id == null ? null : String(row.empresa_id),
  property_id: row.propiedad_id == null ? null : String(row.propiedad_id),
  template_id: row.plantilla_id == null ? null : String(row.plantilla_id),
  model_id: String(row.modelo_id),
  modo: row.modo,
  prompt: row.prompt,
  parametros: row.parametros ?? {},
  status: row.estado,
  credits_cost: Number(row.creditos_costo),
  provider_request_id: row.peticion_proveedor_id ?? null,
  error_message: row.error_mensaje ?? null,
  created_at: new Date(row.creado_en).toISOString(),
  updated_at: new Date(row.actualizado_en).toISOString(),
}));

export const tipoPlantillaResource = new BaseResource<any, TipoPlantilla>((row) => ({
  tipo_plantilla_id: row.tipo_plantilla_id,
  nombre: row.nombre,
  descripcion: row.descripcion,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const plantillaResource = new BaseResource<any, PlantillaView>((row) => ({
  plantilla_id: row.plantilla_id,
  nombre: row.nombre,
  descripcion: row.descripcion ?? null,
  url_logo: row.url_logo ?? null,
  tipo_plantilla_id: row.tipo_plantilla_id,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjeto FK: la tabla incrustada llega como `tipos_plantillas`.
  tipo_plantilla: row.tipos_plantillas ? tipoPlantillaResource.format(row.tipos_plantillas) : null,
}));

export const formatoResource = new BaseResource<any, Formato>((row) => ({
  formato_id: row.formato_id,
  nombre: row.nombre,
  descripcion: row.descripcion ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const enfoqueComercialResource = new BaseResource<any, EnfoqueComercial>((row) => ({
  enfoque_comercial_id: row.enfoque_comercial_id,
  nombre: row.nombre,
  descripcion: row.descripcion ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const contenidoIaResource = new BaseResource<any, ContenidoIaView>((row) => ({
  contenido_ia_id: row.contenido_ia_id,
  propiedad_id: row.propiedad_id,
  plantilla_id: row.plantilla_id,
  formato_id: row.formato_id,
  duracion: row.duracion,
  enfoque_comercial_id: row.enfoque_comercial_id,
  url_imagen_referencia: row.url_imagen_referencia ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjetos FK (las tablas incrustadas llegan en plural).
  propiedad: row.propiedades ? propiedadResource.format(row.propiedades) : null,
  plantilla: row.plantillas ? plantillaResource.format(row.plantillas) : null,
  formato: row.formatos ? formatoResource.format(row.formatos) : null,
  enfoque_comercial: row.enfoques_comerciales
    ? enfoqueComercialResource.format(row.enfoques_comerciales)
    : null,
}));
