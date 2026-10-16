import { BaseModel } from "../../core";

export interface Formato extends BaseModel<Formato> {
  formato_id: number;
  nombre: string;
  descripcion: string | null;
}