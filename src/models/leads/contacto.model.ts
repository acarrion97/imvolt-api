import { BaseModel } from "../../core";
import { PropiedadView } from "../property/propiedad.model";

export interface Contacto extends BaseModel<Contacto> {
  contacto_id: number;
  propiedad_id: number | null;
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
  origen: string;
  /** Empresa dueña del contacto (tenant). */
  empresa_id: number | null;
}

/** MODELO DE VISUALIZACIÓN: el contacto con la propiedad consultada (si existe). */
export interface ContactoView extends Contacto {
  /** Relación incrustada (FK → propiedades); null si el lead llegó sin propiedad. */
  propiedad: PropiedadView | null;
}