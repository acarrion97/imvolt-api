import { BaseModel } from "../../core";

export interface HitoLanzamiento extends BaseModel<HitoLanzamiento> {
    hito_lanzamiento_id: number;
    nombre: string;
    descripcion: string;
    orden: number;
    obligatorio: boolean;
}