// models/advertising/campania_publicitaria.model.ts
// Campaña publicitaria de un inmueble (tabla `campanias_publicitarias`).

import { BaseModel } from "../../core";
import { PropiedadView } from "../property/propiedad.model";
import { ObjetivoPublicidad } from "./objetivo_publicidad.model";

export interface CampaniaPublicitaria extends BaseModel<CampaniaPublicitaria> {
  campania_publicitaria_id: number;
  propiedad_id: number;
  objetivo_publicidad_id: number;
  presupuesto_diario: number;
  duracion_dias: number;
  zona_referencia: string;
  copy_anuncio: string;
  /** ID de la campaña en Meta (null mientras sea borrador local). */
  meta_campaign_id: string | null;
  /** null = borrador · 'publicando' = reservada · 'published_paused' = creada en Meta (PAUSED). */
  meta_estado: 'publicando' | 'published_paused' | null;
  publicada_en: string | null;
}

/** MODELO DE VISUALIZACIÓN: la campaña con su propiedad y su objetivo. */
export interface CampaniaPublicitariaView extends CampaniaPublicitaria {
  /** Relación incrustada (FK → propiedades). */
  propiedad: PropiedadView | null;
  /** Relación incrustada (FK → objetivo_publicidad). */
  objetivo_publicidad: ObjetivoPublicidad | null;
}
