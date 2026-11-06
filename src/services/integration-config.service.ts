import supabase from '../config/supabaseClient';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from './integration-credentials.crypto';

export interface CompanyIntegrationConfig {
  configuracion_integracion_id: number;
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
      'configuraciones_integraciones!inner(configuracion_integracion_id, url_base, api_key, entorno, api_id, app_secret, access_token, estado), integraciones!inner(nombre)',
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

  const rawConfiguration = data?.configuraciones_integraciones;
  if (!rawConfiguration) return null;

  const configuration = Array.isArray(rawConfiguration)
    ? rawConfiguration[0]
    : rawConfiguration;
  if (!configuration) return null;

  let appSecret = configuration.app_secret ?? null;
  if (appSecret) {
    if (!isEncryptedIntegrationSecret(appSecret)) {
      const encrypted = encryptIntegrationSecret(appSecret);
      const { error: migrationError } = await supabase
        .from('configuraciones_integraciones')
        .update({ app_secret: encrypted })
        .eq('configuracion_integracion_id', configuration.configuracion_integracion_id)
        .eq('empresa_id', Number(empresaId));
      if (migrationError) {
        throw new Error(`No se pudo cifrar la credencial existente: ${migrationError.message}`);
      }
    } else {
      appSecret = decryptIntegrationSecret(appSecret);
    }
  }

  return { ...configuration, app_secret: appSecret };
}
