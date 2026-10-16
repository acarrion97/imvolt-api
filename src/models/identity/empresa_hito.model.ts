import { BaseModel } from "../../core";
import { Empresa } from "./empresa.model";
import { HitoLanzamiento } from "./hito_lanzamiento.model";

export interface EmpresaHito extends BaseModel<EmpresaHito> {
    empresa_hito_id: number;
    empresa_id: number;
    hito_lanzamiento_id: number;
    observaciones: string;
}

/** MODELO DE VISUALIZACIÓN: el avance del hito con empresa e hito incrustados. */
export interface EmpresaHitoView extends EmpresaHito {
    /** Relación incrustada (FK → empresas). */
    empresa: Empresa | null;
    /** Relación incrustada (FK → hitos_lanzamientos). */
    hito_lanzamiento: HitoLanzamiento | null;
}