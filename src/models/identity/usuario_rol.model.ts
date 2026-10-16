import { BaseModel } from "../../core";
import { Rol } from "./rol.model";
import { UsuarioView } from "./usuario.model";

/** Asignación de un rol a un usuario (tabla `roles_usuarios` del diagrama). */
export interface UsuarioRol extends BaseModel<UsuarioRol> {
    usuario_rol_id: number;
    usuario_id: number;
    rol_id: number;
}

/** MODELO DE VISUALIZACIÓN: la asignación con su usuario y su rol incrustados. */
export interface UsuarioRolView extends UsuarioRol {
    /** Relación incrustada (FK → usuarios). */
    usuario: UsuarioView | null;
    /** Relación incrustada (FK → roles). */
    rol: Rol | null;
}
