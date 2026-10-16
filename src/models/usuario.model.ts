import { BaseModel } from "../core";

export interface Usuario extends BaseModel<Usuario> {
    nombre: string;
    email: string;
    telefono: string | null;
    empresa_id: number;
    contrasenia_temporal_hasta: Date | null | string; 
}