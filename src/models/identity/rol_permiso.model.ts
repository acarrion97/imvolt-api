import { BaseModel } from "../../core";
import { Permiso } from "./permiso.model";
import { Rol } from "./rol.model";

export interface RolPermiso extends BaseModel<RolPermiso> {
    permiso_rol_id: number;
    rol_id: number;
    permiso_id: number;
}

/** MODELO DE VISUALIZACIÓN: el permiso asignado con su rol y su permiso. */
export interface RolPermisoView extends RolPermiso {
    /** Relación incrustada (FK → roles). */
    rol: Rol | null;
    /** Relación incrustada (FK → permisos). */
    permiso: Permiso | null;
}