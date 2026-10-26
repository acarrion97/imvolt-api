// resources/advertising.resource.ts
// Vistas de respuesta del módulo Publicidad.
//
// `campania_publicitaria` incrusta su propiedad y su objetivo como subobjetos.

import { BaseResource } from '../core/base.resource';
import { CampaniaPublicitariaView } from '../models/advertising/campania_publicitaria.model';
import { ObjetivoPublicidad } from '../models/advertising/objetivo_publicidad.model';
import { propiedadResource } from './property.resource';

export const objetivoPublicidadResource = new BaseResource<any, ObjetivoPublicidad>((row) => ({
  objetivo_publicidad_id: row.objetivo_publicidad_id,
  nombre: row.nombre,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
}));

export const campaniaPublicitariaResource = new BaseResource<any, CampaniaPublicitariaView>((row) => ({
  campania_publicitaria_id: row.campania_publicitaria_id,
  propiedad_id: row.propiedad_id,
  objetivo_publicidad_id: row.objetivo_publicidad_id,
  presupuesto_diario: row.presupuesto_diario,
  duracion_dias: row.duracion_dias,
  zona_referencia: row.zona_referencia,
  copy_anuncio: row.copy_anuncio,
  meta_campaign_id: row.meta_campaign_id ?? null,
  meta_estado: row.meta_estado ?? null,
  publicada_en: row.publicada_en ?? null,
  estado: row.estado,
  creado_en: row.creado_en,
  actualizado_en: row.actualizado_en,
  // Subobjetos FK (las tablas incrustadas llegan en plural).
  propiedad: row.propiedades ? propiedadResource.format(row.propiedades) : null,
  objetivo_publicidad: row.objetivo_publicidad
    ? objetivoPublicidadResource.format(row.objetivo_publicidad)
    : null,
}));
