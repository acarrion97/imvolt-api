import { BaseModel } from "../../core";
import { Empresa } from "../identity/empresa.model";
import { TipoPropiedad } from "./tipo_propiedad.model";
import { ProyectoReferencia } from "../catalog/media_asset.model";

/**
 * Canales de publicación donde la empresa AUTORIZA difundir la propiedad.
 * Catálogo fijo: lo validan el Request (Joi), lo documenta OpenAPI y lo
 * ofrece el frontend en el multiselect del formulario.
 */
export const MEDIOS_AUTORIZADOS = [
  'meta_ads',
  'facebook',
  'instagram',
  'whatsapp',
  'tiktok',
  'youtube',
  'portal_web',
  'email',
] as const;

export type MedioAutorizado = (typeof MEDIOS_AUTORIZADOS)[number];

export interface Propiedad extends BaseModel<Propiedad> {
  propiedad_id: string;
  nombre: string;
  ubicacion: string;
  precio: number;
  disponibilidad: string;
  descripcion: string;
  /** Canales de publicación autorizados para esta propiedad. */
  medios_autorizados: MedioAutorizado[];
  empresa_id: number;
  tipo_propiedad_id: number;
  /** Desarrollo al que pertenece la propiedad; null = inmueble individual. */
  proyecto_id: number | null;
}

/** MODELO DE VISUALIZACIÓN: la propiedad con empresa, tipo y proyecto. */
export interface PropiedadView extends Propiedad {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
  /** Relación incrustada (FK → tipos_propiedades). */
  tipo_propiedad: TipoPropiedad | null;
  /** Relación incrustada (FK → proyectos; referencia ligera). */
  proyecto: ProyectoReferencia | null;
}
