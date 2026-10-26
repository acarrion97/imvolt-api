import { BaseModel } from "../../core";
import { Empresa } from "../identity/empresa.model";
import { TipoPropiedad } from "./tipo_propiedad.model";
import { ProyectoReferencia } from "../catalog/media_asset.model";

export interface Propiedad extends BaseModel<Propiedad> {
  propiedad_id: string;
  nombre: string;
  ubicacion: string;
  precio: number;
  disponibilidad: string;
  descripcion: string;
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