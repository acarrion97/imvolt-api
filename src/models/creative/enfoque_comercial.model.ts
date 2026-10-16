import { BaseModel } from "../../core";

export interface EnfoqueComercial extends BaseModel<EnfoqueComercial> {
  enfoque_comercial_id: number;
  nombre: string;
  descripcion: string | null;
}