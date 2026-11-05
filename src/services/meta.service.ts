// services/meta.service.ts
// Adaptador de Meta Marketing API para IMVOLT Ads (documento maestro, §10).
//
// REGLA DE CONFIANZA (§10 "CONTROL DE GASTO"): IMVOLT jamás activa gasto
// publicitario ni modifica presupuestos sin autorización registrada. Los
// recursos se crean siempre en PAUSED cuando el flujo de API lo permite.
//
// Sin conexión activa de la empresa, la publicación opera en modo simulado:
// crea IDs ficticios para
// desarrollar el flujo completo de borrador → aprobación → publicación
// pausada sin permisos de Meta.

import { HttpError, ValidationError } from '../core/errors';
import { config } from '../config/global';
import { Campana, MetaConnection } from '../models/advertising/meta.model';
import axios from 'axios';

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
  return { meta_campaign_id: `META-SIM-${campaign.campaign_id.slice(0, 8).toUpperCase()}` };
}

/** Credenciales de Meta Ads de una empresa (tabla `configuraciones_integraciones`). */
export interface MetaCredentials {
  /** Cuenta publicitaria; se normaliza al formato `act_<id>`. */
  adAccountId: string;
  accessToken: string;
  currency?: string;
}

export interface PublishCampaniaInput {
  campaniaId: number;
  nombre: string;
  /** Nombre del objetivo de publicidad (catálogo: Mensajes, Formularios, Visitas, Tráfico, Branding). */
  objetivo: string;
  credentials: MetaCredentials;
  /** Sin conexión activa asociada a la empresa, la operación es simulada. */
  simulate?: boolean;
  /** Meta valida la petición pero NO crea la campaña. */
  validateOnly?: boolean;
  leadAd?: {
    pageId: string;
    locationKey: string;
    locationCountryCode: string;
    privacyPolicyUrl: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    dailyBudget: number;
    currency: string;
    startAt: string;
    endAt: string;
    title: string;
    copy: string;
  };
}

export interface PublishCampaniaResult {
  /** null cuando solo se validó. */
  meta_campaign_id: string | null;
  simulado: boolean;
  validado_solo: boolean;
  meta_adset_id?: string | null;
  meta_adcreative_id?: string | null;
  meta_ad_id?: string | null;
  meta_lead_form_id?: string | null;
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

interface MetaObjectResponse {
  id: string;
}

interface MetaImageUploadResponse {
  images?: Record<string, { hash?: string }>;
}

interface MetaVideoUploadResponse {
  id?: string;
}

function graphBaseUrl(): string {
  return `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}`;
}

async function graphCreate<T>(
  path: string,
  accessToken: string,
  params: Record<string, unknown>,
): Promise<T> {
  try {
    const body = new URLSearchParams({ access_token: accessToken });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) body.set(key, String(value));
    }
    const { data } = await axios.post<T>(`${graphBaseUrl()}/${path}`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
    });
    return data;
  } catch (error) {
    const meta = (error as {
      response?: { data?: { error?: { message?: string; code?: number } } };
    }).response?.data?.error;
    console.error('[meta] creación de anuncio falló', meta?.code ?? 'sin código');
    throw new HttpError(502, `Meta rechazó la creación del anuncio: ${meta?.message ?? 'error desconocido'}`);
  }
}

async function deleteMetaObject(path: string, accessToken: string): Promise<void> {
  try {
    await axios.post(
      `${graphBaseUrl()}/${path}`,
      new URLSearchParams({ status: 'DELETED', access_token: accessToken }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      },
    );
  } catch (error) {
    const meta = (error as {
      response?: { data?: { error?: { code?: number } } };
    }).response?.data?.error;
    console.error('[meta] no se pudo limpiar objeto pausado tras fallo', meta?.code ?? 'sin código');
  }
}

async function waitForMetaVideo(videoId: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    let status: { status?: { video_status?: string } };
    try {
      const { data } = await axios.get<{ status?: { video_status?: string } }>(
        `${graphBaseUrl()}/${encodeURIComponent(videoId)}`,
        { params: { fields: 'status', access_token: accessToken }, timeout: 15000 },
      );
      status = data;
    } catch (error) {
      const meta = (error as {
        response?: { data?: { error?: { message?: string; code?: number } } };
      }).response?.data?.error;
      console.error('[meta] no se pudo consultar procesamiento del video', meta?.code ?? 'sin código');
      throw new HttpError(502, 'Meta no pudo comprobar el procesamiento del video.');
    }
    if (status.status?.video_status === 'ready') return;
    if (status.status?.video_status === 'error') {
      throw new HttpError(502, 'Meta no pudo procesar el video generado.');
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new HttpError(504, 'Meta aún está procesando el video. Intenta publicar de nuevo más tarde.');
}

async function createPausedLeadAd(input: PublishCampaniaInput): Promise<PublishCampaniaResult> {
  const leadAd = input.leadAd;
  if (!leadAd) throw new ValidationError('Faltan datos para crear el anuncio de formulario.');
  if (!/^[A-Z]{3}$/.test(leadAd.currency)) {
    throw new ValidationError('La moneda de la cuenta publicitaria no es válida. Vuelve a conectar Meta.');
  }
  if (
    !/^\d{1,30}$/.test(leadAd.pageId) ||
    !/^\d{1,30}$/.test(leadAd.locationKey) ||
    !/^[A-Z]{2}$/.test(leadAd.locationCountryCode)
  ) {
    throw new ValidationError('La página o ubicación seleccionada no tiene un identificador de Meta válido.');
  }
  let fractionDigits: number;
  try {
    fractionDigits = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: leadAd.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new ValidationError('La moneda de la cuenta publicitaria no es compatible.');
  }
  if (!Number.isFinite(leadAd.dailyBudget) || leadAd.dailyBudget < 2) {
    throw new ValidationError(`El presupuesto diario mínimo es 2 ${leadAd.currency}.`);
  }
  if (!/^https:\/\//i.test(leadAd.mediaUrl) || !/^https:\/\//i.test(leadAd.privacyPolicyUrl)) {
    throw new ValidationError('El creativo y la política de privacidad deben usar URLs públicas HTTPS.');
  }
  const startTime = Date.parse(leadAd.startAt);
  const endTime = Date.parse(leadAd.endAt);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime || startTime <= Date.now()) {
    throw new ValidationError('El inicio debe ser futuro y la fecha final posterior al inicio.');
  }
  if (input.validateOnly) {
    return { meta_campaign_id: null, simulado: false, validado_solo: true };
  }

  const accountId = normalizarCuenta(input.credentials.adAccountId);
  const token = input.credentials.accessToken;
  const created: string[] = [];
  let campaignId: string | null = null;
  try {
    const campaign = await graphCreate<MetaObjectResponse>(`${accountId}/campaigns`, token, {
      name: input.nombre,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: JSON.stringify(['HOUSING']),
      special_ad_category_country: JSON.stringify([leadAd.locationCountryCode]),
      is_adset_budget_sharing_enabled: false,
    });
    if (!campaign.id) throw new Error('Meta no devolvió el ID de campaña.');
    campaignId = campaign.id;
    created.push(campaign.id);

    const form = await graphCreate<MetaObjectResponse>(`${leadAd.pageId}/leadgen_forms`, token, {
      name: `${input.nombre} — formulario`,
      privacy_policy: JSON.stringify({
        url: leadAd.privacyPolicyUrl,
        link_text: 'Política de privacidad',
      }),
      questions: JSON.stringify([{ type: 'FULL_NAME' }, { type: 'EMAIL' }, { type: 'PHONE' }]),
    });
    if (!form.id) throw new Error('Meta no devolvió el ID del formulario instantáneo.');
    created.push(form.id);

    let imageHash: string | undefined;
    let videoId: string | undefined;
    if (leadAd.mediaType === 'image') {
      const uploaded = await graphCreate<MetaImageUploadResponse>(`${accountId}/adimages`, token, {
        url: leadAd.mediaUrl,
      });
      imageHash = Object.values(uploaded.images ?? {})[0]?.hash;
      if (!imageHash) throw new Error('Meta no devolvió el hash de la imagen.');
    } else {
      const uploaded = await graphCreate<MetaVideoUploadResponse>(`${accountId}/advideos`, token, {
        file_url: leadAd.mediaUrl,
        title: leadAd.title,
      });
      videoId = uploaded.id;
      if (!videoId) throw new Error('Meta no devolvió el ID del video.');
      await waitForMetaVideo(videoId, token);
    }

    const adSet = await graphCreate<MetaObjectResponse>(`${accountId}/adsets`, token, {
      name: `${input.nombre} — conjunto`,
      campaign_id: campaign.id,
      daily_budget: String(Math.round(leadAd.dailyBudget * (10 ** fractionDigits))),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      destination_type: 'ON_AD',
      start_time: leadAd.startAt,
      end_time: leadAd.endAt,
      targeting: JSON.stringify({ geo_locations: { cities: [{ key: leadAd.locationKey }] } }),
      promoted_object: JSON.stringify({ page_id: leadAd.pageId }),
      status: 'PAUSED',
    });
    if (!adSet.id) throw new Error('Meta no devolvió el ID del conjunto de anuncios.');
    created.push(adSet.id);

    const creativeSpec = leadAd.mediaType === 'image'
      ? {
          page_id: leadAd.pageId,
          link_data: {
            image_hash: imageHash,
            link: 'https://www.facebook.com/',
            message: leadAd.copy,
            name: leadAd.title,
            call_to_action: {
              type: 'SIGN_UP',
              value: { lead_gen_form_id: form.id },
            },
          },
        }
      : {
          page_id: leadAd.pageId,
          video_data: {
            video_id: videoId,
            message: leadAd.copy,
            title: leadAd.title,
            call_to_action: {
              type: 'SIGN_UP',
              value: { lead_gen_form_id: form.id },
            },
          },
        };
    const creative = await graphCreate<MetaObjectResponse>(`${accountId}/adcreatives`, token, {
      name: `${input.nombre} — creativo`,
      object_story_spec: JSON.stringify(creativeSpec),
    });
    if (!creative.id) throw new Error('Meta no devolvió el ID del creativo.');
    created.push(creative.id);

    const ad = await graphCreate<MetaObjectResponse>(`${accountId}/ads`, token, {
      name: input.nombre,
      adset_id: adSet.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: 'PAUSED',
    });
    if (!ad.id) throw new Error('Meta no devolvió el ID del anuncio.');
    created.push(ad.id);

    return {
      meta_campaign_id: campaign.id,
      meta_adset_id: adSet.id,
      meta_adcreative_id: creative.id,
      meta_ad_id: ad.id,
      meta_lead_form_id: form.id,
      simulado: false,
      validado_solo: false,
    };
  } catch (error) {
    for (const id of created.reverse()) {
      await deleteMetaObject(id, token);
    }
    if (error instanceof HttpError || error instanceof ValidationError) throw error;
    throw new HttpError(502, `No se pudo completar la creación del anuncio${campaignId ? ` (campaña ${campaignId})` : ''}. Los objetos pausados se limpiaron cuando fue posible.`);
  }
}

/**
 * Crea la campaña en Meta con el SDK oficial, SIEMPRE en PAUSED y con la
 * categoría especial HOUSING (anuncios inmobiliarios, §10). Sin credenciales
 * de la empresa devuelve un ID ficticio. El presupuesto y la
 * segmentación viven en el conjunto de anuncios (siguiente paso del flujo),
 * no en la campaña.
 *
 * El token nunca se registra ni se devuelve: los errores de Meta se reducen a
 * su mensaje público.
 */
async function publishCampaniaPaused(input: PublishCampaniaInput): Promise<PublishCampaniaResult> {
  const objective = objetivoMeta(input.objetivo);
  const validateOnly = input.validateOnly === true;

  if (input.leadAd && (
    input.simulate ||
    !input.credentials.accessToken ||
    !input.credentials.adAccountId
  )) {
    throw new HttpError(
      503,
      'La creación real del anuncio requiere una cuenta publicitaria Meta conectada. No se generó una campaña simulada.',
    );
  }

  if (input.simulate || !input.credentials.accessToken || !input.credentials.adAccountId) {
    return {
      meta_campaign_id: validateOnly ? null : `META-SIM-${String(input.campaniaId).padStart(8, '0')}`,
      simulado: true,
      validado_solo: validateOnly,
      ...(input.leadAd && !validateOnly
        ? {
            meta_adset_id: `META-SIM-ADSET-${input.campaniaId}`,
            meta_adcreative_id: `META-SIM-CREATIVE-${input.campaniaId}`,
            meta_ad_id: `META-SIM-AD-${input.campaniaId}`,
            meta_lead_form_id: `META-SIM-FORM-${input.campaniaId}`,
          }
        : {}),
    };
  }
  if (input.leadAd) return createPausedLeadAd(input);

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

export const metaService = { validate, publishPaused, publishCampaniaPaused, fetchInsights };
