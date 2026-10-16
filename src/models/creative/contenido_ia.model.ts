// models/contenido_ia.model.ts
// Contenido generado con IA: une una propiedad con una plantilla, un formato
// y un enfoque comercial (tabla `contenidos_ia` del diagrama relacional).

import { BaseModel } from "../../core";
import { PropiedadView } from "../property/propiedad.model";
import { EnfoqueComercial } from "./enfoque_comercial.model";
import { Formato } from "./formato.model";
import { PlantillaView } from "./plantilla.model";

export interface ContenidoIa extends BaseModel<ContenidoIa> {
  contenido_ia_id: number;
  propiedad_id: number;
  plantilla_id: number;
  formato_id: number;
  duracion: string;
  enfoque_comercial_id: number;
  url_imagen_referencia: string | null;
}

/**
 * MODELO DE VISUALIZACIÓN: el contenido con sus cuatro relaciones
 * (propiedad, plantilla, formato y enfoque comercial) incrustadas.
 */
export interface ContenidoIaView extends ContenidoIa {
  /** Relación incrustada (FK → propiedades). */
  propiedad: PropiedadView | null;
  /** Relación incrustada (FK → plantillas). */
  plantilla: PlantillaView | null;
  /** Relación incrustada (FK → formatos). */
  formato: Formato | null;
  /** Relación incrustada (FK → enfoques_comerciales). */
  enfoque_comercial: EnfoqueComercial | null;
}

/** Alias histórico (typo original del modelo) mantenido por compatibilidad. */
export type ConenidoIa = ContenidoIa;
