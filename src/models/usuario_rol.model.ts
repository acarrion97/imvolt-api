import { BaseModel } from "../core";

export interface UsuarioRol extends BaseModel<UsuarioRol> {
    usuario_rol_id: number;
    usuario_id: number;
    rol_id: number;
    usuario_rol: number;
}