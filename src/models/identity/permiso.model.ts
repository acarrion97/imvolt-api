import { BaseModel } from "../../core";

export interface Permiso extends BaseModel<Permiso> {
    permiso_id: number;
    nombre: string;
}