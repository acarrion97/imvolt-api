import { BaseModel } from "../../core";
import { TipoPlantilla } from "./tipo_plantilla.model";

export interface Plantilla extends BaseModel<Plantilla> {
  plantilla_id: number;
  nombre: string;
  descripcion: string | null;
  url_logo: string | null;
  tipo_plantilla_id: number;
}

/** MODELO DE VISUALIZACIÓN: la plantilla con su tipo incrustado. */
export interface PlantillaView extends Plantilla {
  /** Relación incrustada (FK → tipos_plantillas). */
  tipo_plantilla: TipoPlantilla | null;
}