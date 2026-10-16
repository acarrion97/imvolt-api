import { BaseModel } from "../../core";

export interface TipoPlantilla extends BaseModel<TipoPlantilla> {
    tipo_plantilla_id: number;
    nombre: string;
    descripcion: string;
}