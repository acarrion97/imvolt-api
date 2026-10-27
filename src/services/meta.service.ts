// services/meta.service.ts
// Adaptador de Meta Marketing API para IMVOLT Ads (documento maestro, §10).
//
// REGLA DE CONFIANZA (§10 "CONTROL DE GASTO"): IMVOLT jamás activa gasto
// publicitario ni modifica presupuestos sin autorización registrada. Los
// recursos se crean siempre en PAUSED cuando el flujo de API lo permite.
//
// Sin META_ACCESS_TOKEN/META_AD_ACCOUNT_ID (o con META_SIMULATE=true) el servicio opera en modo
// simulado: crea IDs ficticios y devuelve insights de demostración, para
// desarrollar el flujo completo de borrador → aprobación → publicación
// pausada sin permisos de Meta.

import { config } from '../config/global';
import { HttpError, ValidationError } from '../core/errors';
import { Campana, MetaConnection } from '../models/advertising/meta.model';

export interface ValidationResult {
  valido: boolean;
  errores: string[];
  advertencias: string[];
}

const DESTINO_OBJETIVO_COMPATIBLE: Record<string, string[]> = {
  whatsapp: ['mensajes'],
  formulario: ['formularios'],
  landing: ['visitas', 'trafico', 'branding'],
};

/**
 * Validaciones previas al borrador/publicación. Incluye las restricciones de
 * categoría "vivienda" (§10): la IA no reemplaza estas validaciones.
 */
function validate(campaign: Partial<Campana>, connection: MetaConnection | null): ValidationResult {
  const errores: string[] = [];
  const advertencias: string[] = [];

  if (!connection || connection.estado !== 'conectada') {
    errores.push('Requiere una cuenta publicitaria de Meta conectada y vigente.');
  }
  if (!campaign.presupuesto_maximo || campaign.presupuesto_maximo <= 0) {
    errores.push('El presupuesto máximo debe ser mayor a cero.');
  }
  if (campaign.destino && campaign.objetivo) {
    const compatibles = DESTINO_OBJETIVO_COMPATIBLE[campaign.destino] ?? [];
    if (!compatibles.includes(campaign.objetivo)) {
      errores.push(`El destino "${campaign.destino}" no es compatible con el objetivo "${campaign.objetivo}".`);
    }
  }
  if (!campaign.copy || !campaign.titulo) {
    errores.push('La campaña necesita copy y título antes de validarse.');
  }
  if (!campaign.creative_url) {
    errores.push('La campaña necesita un creativo aprobado.');
  }
  if (campaign.fecha_inicio && campaign.fecha_fin && campaign.fecha_fin < campaign.fecha_inicio) {
    errores.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  advertencias.push(
    'Categoría vivienda: revisa que la segmentación cumpla las políticas vigentes de Meta para anuncios de vivienda.',
  );
  advertencias.push('Confirma precio, disponibilidad y condiciones antes de publicar (aprobación editorial, §07).');

  return { valido: errores.length === 0, errores, advertencias };
}

/** Crea el recurso de campaña en Meta en estado PAUSADO. */
async function publishPaused(campaign: Campana): Promise<{ meta_campaign_id: string }> {
  if (config.meta.simulate) {
    return { meta_campaign_id: `META-SIM-${campaign.campaign_id.slice(0, 8).toUpperCase()}` };
  }

  // Implementación real: facebook-nodejs-business-sdk con el token de la
  // conexión. Se deja documentada; requiere permisos aprobados por Meta.
  //
  // const Campaign = require('facebook-nodejs-business-sdk').Campaign;
  // const campaign = await Campaign.create(...status: 'PAUSED'...)
  throw new HttpError(
    501,
    'La publicación real en Meta requiere credenciales Meta App y permisos aprobados. Usa la exportación manual de anuncios mientras tanto.',
  );
}

/** Credenciales de Meta Ads de una empresa (tabla `configuraciones_integraciones`). */
export interface MetaCredentials {
  /** Cuenta publicitaria; se normaliza al formato `act_<id>`. */
  adAccountId: string;
  accessToken: string;
}

export interface PublishCampaniaInput {
  campaniaId: number;
  nombre: string;
  /** Nombre del objetivo de publicidad (catálogo: Mensajes, Formularios, Visitas, Tráfico, Branding). */
  objetivo: string;
  credentials: MetaCredentials;
  /** Meta valida la petición pero NO crea la campaña. */
  validateOnly?: boolean;
}

export interface PublishCampaniaResult {
  /** null cuando solo se validó. */
  meta_campaign_id: string | null;
  simulado: boolean;
  validado_solo: boolean;
}

/** Objetivo del catálogo IMVOLT → objetivo ODAX de Meta. */
const OBJETIVO_META: Record<string, string> = {
  mensajes: 'OUTCOME_ENGAGEMENT',
  formularios: 'OUTCOME_LEADS',
  visitas: 'OUTCOME_TRAFFIC',
  trafico: 'OUTCOME_TRAFFIC',
  branding: 'OUTCOME_AWARENESS',
};

const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Objetivo ODAX de Meta para un objetivo del catálogo; 400 si no tiene equivalente. */
function objetivoMeta(objetivo: string): string {
  const meta = OBJETIVO_META[normalizar(objetivo)];
  if (!meta) {
    throw new ValidationError('El objetivo de la campaña no tiene equivalente en Meta', [
      { field: 'objetivo_publicidad_id', message: `Objetivo "${objetivo}" no soportado` },
    ]);
  }
  return meta;
}

const normalizarCuenta = (id: string): string => (id.startsWith('act_') ? id : `act_${id}`);

/**
 * Crea la campaña en Meta con el SDK oficial, SIEMPRE en PAUSED y con la
 * categoría especial HOUSING (anuncios inmobiliarios, §10). Sin credenciales
 * de la App (`META_SIMULATE`) devuelve un ID ficticio. El presupuesto y la
 * segmentación viven en el conjunto de anuncios (siguiente paso del flujo),
 * no en la campaña.
 *
 * El token nunca se registra ni se devuelve: los errores de Meta se reducen a
 * su mensaje público.
 */
async function publishCampaniaPaused(input: PublishCampaniaInput): Promise<PublishCampaniaResult> {
  const objective = objetivoMeta(input.objetivo);
  const validateOnly = input.validateOnly === true;

  if (config.meta.simulate) {
    return {
      meta_campaign_id: validateOnly ? null : `META-SIM-${String(input.campaniaId).padStart(8, '0')}`,
      simulado: true,
      validado_solo: validateOnly,
    };
  }

  // El SDK no publica tipos: se carga bajo demanda y se usa de forma acotada.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bizSdk = require('facebook-nodejs-business-sdk');
  bizSdk.FacebookAdsApi.init(input.credentials.accessToken);

  const params: Record<string, unknown> = {
    name: input.nombre,
    objective,
    status: 'PAUSED',
    special_ad_categories: ['HOUSING'],
    is_adset_budget_sharing_enabled: false,
  };
  if (validateOnly) params.execution_options = ['validate_only'];

  try {
    const creada = await new bizSdk.AdAccount(normalizarCuenta(input.credentials.adAccountId)).createCampaign([], params);
    return {
      meta_campaign_id: validateOnly ? null : String(creada.id),
      simulado: false,
      validado_solo: validateOnly,
    };
  } catch (error) {
    const meta = (error as { response?: { error?: { message?: string; code?: number } } }).response?.error;
    console.error('[meta] createCampaign falló', meta?.code ?? 'sin código');
    throw new HttpError(502, `Meta rechazó la campaña: ${meta?.message ?? 'error desconocido'}`);
  }
}

/** Consulta insights consolidados (simulados sin credenciales). */
async function fetchInsights(campaign: Campana): Promise<{
  gasto: number;
  impresiones: number;
  clics: number;
  leads: number;
  alcance: number;
}> {
  if (config.meta.simulate) {
    // Determinístico por campaña para que los números no salten entre consultas.
    const seed = campaign.campaign_id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const impresiones = 1200 + (seed % 2600);
    const clics = Math.round(impresiones * (0.012 + (seed % 7) / 1000));
    const leads = Math.round(clics * 0.18);
    return {
      gasto: Number((campaign.presupuesto_maximo * 0.34).toFixed(2)),
      impresiones,
      clics,
      leads,
      alcance: Math.round(impresiones * 0.72),
    };
  }

  throw new HttpError(
    501,
    'Los insights reales requieren permisos de Meta sobre la cuenta publicitaria.',
  );
}

export const metaService = { validate, publishPaused, publishCampaniaPaused, fetchInsights };
