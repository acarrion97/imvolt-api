import axios from 'axios';
import { HttpError, ValidationError } from '../core/errors';
import { getCompanyIntegrationConfig } from './integration-config.service';

const INTEGRATION_NAME = 'Lotes al Mando';
const DEFAULT_BASE_URL = 'https://lotes-al-mando-api.onrender.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export interface LotesProyecto {
  id_proyecto: number;
  nombre: string;
}

export interface LotesEtapa {
  id_etapa: number;
  id_proyecto: number;
  nombre: string;
}

export interface LotesManzana {
  id_manzana: number;
  id_etapa: number;
  nombre_codigo: string | null;
}

export interface LotesLote {
  id_lote: number;
  id_manzana: number;
  numero_lote: string | null;
  precio_lista: number | null;
  estado: string;
  superficie_m2: number | null;
  codigo_catastral: string | null;
  medidas: string | null;
}

export interface LotesInventorySnapshot {
  proyectos: LotesProyecto[];
  etapas: LotesEtapa[];
  manzanas: LotesManzana[];
  lotes: LotesLote[];
}

interface LoginResponse {
  access_token: string;
}

interface LotesCredentials {
  baseUrl: string;
  email: string;
  password: string;
}

function providerError(error: unknown, operation: string): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = error.response?.data?.message;

    if (status === 401 || status === 403) {
      throw new HttpError(502, 'Lotes al Mando rechazó las credenciales de la integración.');
    }
    if (status === 429) {
      throw new HttpError(503, 'Lotes al Mando limitó temporalmente las solicitudes. Intenta de nuevo más tarde.');
    }

    const diagnostic = status
      ? ` (HTTP ${status})`
      : error.code
        ? ` (código ${error.code})`
        : '';
    throw new HttpError(
      status === 408 || error.code === 'ECONNABORTED' ? 504 : 502,
      typeof message === 'string'
        ? `Lotes al Mando: ${message}${diagnostic}`
        : `No se pudo completar ${operation} en Lotes al Mando${diagnostic}.`,
    );
  }
  throw error;
}

function resolveBaseUrl(urlBase: string): string {
  let url: URL;
  try {
    url = new URL(urlBase);
  } catch {
    throw new HttpError(503, 'La URL configurada para Lotes al Mando no es válida.');
  }

  if (
    url.protocol !== 'https:' ||
    url.origin !== DEFAULT_BASE_URL ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new HttpError(503, `La URL de Lotes al Mando debe ser ${DEFAULT_BASE_URL}.`);
  }

  return url.origin;
}

async function getCredentials(empresaId: string | number): Promise<LotesCredentials> {
  const parsedEmpresaId = Number(empresaId);
  if (!Number.isSafeInteger(parsedEmpresaId) || parsedEmpresaId <= 0) {
    throw new ValidationError('Se requiere una empresa válida para usar Lotes al Mando.');
  }

  const integration = await getCompanyIntegrationConfig(parsedEmpresaId, INTEGRATION_NAME);
  if (!integration) {
    throw new HttpError(503, 'La integración de Lotes al Mando no está configurada o activa para esta empresa.');
  }
  if (!['produccion', 'production', 'prod'].includes(integration.entorno.trim().toLowerCase())) {
    throw new HttpError(503, 'Lotes al Mando no admite modo sandbox; configura la integración en producción.');
  }

  const email = integration.api_key?.trim();
  const password = integration.app_secret?.trim();
  if (!email || !password) {
    throw new HttpError(503, 'La configuración de Lotes al Mando debe incluir el correo y la contraseña.');
  }

  return {
    baseUrl: resolveBaseUrl(integration.url_base || DEFAULT_BASE_URL),
    email,
    password,
  };
}

async function authenticate(credentials: LotesCredentials): Promise<string> {
  try {
    const { data } = await axios.post<LoginResponse>(
      `${credentials.baseUrl}/api/auth/login`,
      { email: credentials.email, password: credentials.password },
      { timeout: 15000 },
    );
    if (!data?.access_token) {
      throw new HttpError(502, 'Lotes al Mando no devolvió un access token válido.');
    }
    return data.access_token;
  } catch (error) {
    providerError(error, 'la autenticación');
  }
}

async function getAllPages<T>(
  baseUrl: string,
  token: string,
  resource: string,
): Promise<T[]> {
  const results: T[] = [];
  for (let pagina = 1; pagina <= MAX_PAGES; pagina += 1) {
    try {
      const { data } = await axios.get<unknown>(`${baseUrl}/api/v1/${resource}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limite: PAGE_SIZE, pagina },
        timeout: 20000,
      });
      if (!Array.isArray(data)) {
        throw new HttpError(502, `Lotes al Mando devolvió una lista inválida para ${resource}.`);
      }

      results.push(...(data as T[]));
      if (data.length < PAGE_SIZE) return results;
    } catch (error) {
      providerError(error, `la consulta de ${resource}`);
    }
  }

  throw new HttpError(
    422,
    `La consulta de ${resource} superó el máximo de ${MAX_PAGES * PAGE_SIZE} registros por sincronización.`,
  );
}

export async function getInventorySnapshot(
  empresaId: string | number,
): Promise<LotesInventorySnapshot> {
  const credentials = await getCredentials(empresaId);
  const token = await authenticate(credentials);
  const [proyectos, etapas, manzanas, lotes] = await Promise.all([
    getAllPages<LotesProyecto>(credentials.baseUrl, token, 'proyectos'),
    getAllPages<LotesEtapa>(credentials.baseUrl, token, 'etapas'),
    getAllPages<LotesManzana>(credentials.baseUrl, token, 'manzanas'),
    getAllPages<LotesLote>(credentials.baseUrl, token, 'lotes'),
  ]);

  return { proyectos, etapas, manzanas, lotes };
}

export const lotesAlMandoService = { getInventorySnapshot };
export default lotesAlMandoService;
