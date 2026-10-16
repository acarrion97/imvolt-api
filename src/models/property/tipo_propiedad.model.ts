import { BaseModel } from "../../core";

export interface TipoPropiedad extends BaseModel<TipoPropiedad> {
  tipo_propiedad_id: number;
  nombre: string;
}