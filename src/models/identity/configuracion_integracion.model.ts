import { BaseModel } from "../../core";

export interface ConfiguracionIntegracion extends BaseModel<ConfiguracionIntegracion> {
    configuracion_integracion_id: number;
    url_base: string;
    api_key: string;
    entorno: string;
    api_id: string|null;
    app_secret: string|null;
    access_token: string|null;
    /** Empresa dueña de la credencial (tenant). */
    empresa_id: number | null;
}

/**
 * MODELO DE VISUALIZACIÓN: las credenciales NUNCA se devuelven completas.
 * Solo se expone la marca `••••` (o null si no estaban configuradas).
 */
export interface ConfiguracionIntegracionView extends Omit<ConfiguracionIntegracion, 'api_key' | 'app_secret' | 'access_token'> {
    api_key: string | null;
    app_secret: string | null;
    access_token: string | null;
}
