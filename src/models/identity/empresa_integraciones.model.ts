import { BaseModel } from "../../core";
import { ConfiguracionIntegracionView } from "./configuracion_integracion.model";
import { Empresa } from "./empresa.model";
import { Integracion } from "./integracion.model";

export interface EmpresaIntegraciones extends BaseModel<EmpresaIntegraciones> {
    empresa_integracion_id: number;
    empresa_id: number;
    integracion_id: number;
    configuracion_integracion_id: number;
    referencia_credencial: string;
}

/** MODELO DE VISUALIZACIÓN: el vínculo con empresa, integración y configuración. */
export interface EmpresaIntegracionesView extends EmpresaIntegraciones {
    /** Relación incrustada (FK → empresas). */
    empresa: Empresa | null;
    /** Relación incrustada (FK → integraciones). */
    integracion: Integracion | null;
    /** Relación incrustada (FK → configuraciones_integraciones, credenciales enmascaradas). */
    configuracion_integracion: ConfiguracionIntegracionView | null;
}