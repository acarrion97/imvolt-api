import { BaseModel } from "../../core";
import { Empresa } from "./empresa.model";

export interface Usuario extends BaseModel<Usuario> {
    usuario_id: number;
    nombre: string;
    email: string;
    telefono: string | null;
    empresa_id: number;
    contrasenia_temporal_hasta: Date | null | string; 
}

/**
 * MODELO DE VISUALIZACIÓN: forma exacta en que la API devuelve un usuario,
 * con su empresa (FK `empresas`) incrustada como subobjeto.
 */
export interface UsuarioView extends Usuario {
    /** Relación incrustada (FK → empresas); null si no se pudo resolver. */
    empresa: Empresa | null;
}