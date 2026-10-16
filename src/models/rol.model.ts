import { BaseModel } from "../core";

export interface Rol extends BaseModel<Rol> {
    rol_id: number;
    nombre: string;
}