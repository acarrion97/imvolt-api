import { BaseModel } from "../../core";
import { Empresa } from "../identity/empresa.model";
import { TipoPropiedad } from "./tipo_propiedad.model";

export interface Propiedad extends BaseModel<Propiedad> {
  propiedad_id: string;
  nombre: string;
  ubicacion: string;
  precio: number;
  disponibilidad: string;
  descripcion: string;
  empresa_id: number;
  tipo_propiedad_id: number;
}

/** MODELO DE VISUALIZACIÓN: la propiedad con empresa y tipo incrustados. */
export interface PropiedadView extends Propiedad {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
  /** Relación incrustada (FK → tipos_propiedades). */
  tipo_propiedad: TipoPropiedad | null;
}