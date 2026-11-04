import supabase from '../config/supabaseClient';

export interface CompanyIntegrationConfig {
  url_base: string;
  api_key: string;
  entorno: string;
  api_id: string | null;
  app_secret: string | null;
  access_token: string | null;
}

/**
 * Returns an active integration configuration linked to the requested company.
 * Credentials are read only by backend services and never exposed in API responses.
 */
export async function getCompanyIntegrationConfig(
  empresaId: string | number,
  integrationName: string,
): Promise<CompanyIntegrationConfig | null> {
  const { data, error } = await supabase
    .from('empresas_integraciones')
    .select(
      'configuraciones_integraciones!inner(url_base, api_key, entorno, api_id, app_secret, access_token, estado), integraciones!inner(nombre)',
    )
    .eq('empresa_id', Number(empresaId))
    .eq('estado', 'activo')
    .eq('integraciones.nombre', integrationName)
    .eq('integraciones.activa', true)
    .eq('integraciones.estado', 'activo')
    .eq('configuraciones_integraciones.estado', 'activo')
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer la configuración de integración "${integrationName}": ${error.message}`);
  }

  const configuration = data?.configuraciones_integraciones;
  if (!configuration) return null;
  return Array.isArray(configuration) ? configuration[0] ?? null : configuration;
}
