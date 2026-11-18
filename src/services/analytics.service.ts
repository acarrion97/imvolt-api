import axios from 'axios';
import { config } from '../config/global';
import type { MetaCredentials } from './meta.service';

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string | null;
  fuente: 'meta' | 'demo';
  gasto: number | null;
  impresiones: number | null;
  clics: number | null;
  leads: number | null;
  ctr: number | null;
  cpl: number | null;
  metricas_disponibles: boolean;
  actualizado_en: string | null;
}

const numero = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

// Semilla estable (FNV-1a) para que los datos de demostración no cambien entre
// consultas: mismo campaña + mismo rango = mismas cifras.
const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const randomGenerator = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Métricas de DEMOSTRACIÓN: sintéticas, deterministas y generadas en el
 * servidor. NO provienen de Meta. Existen porque las cuentas sandbox de Meta
 * no entregan anuncios y su Insights API devuelve siempre `data: []`.
 * Se piden explícitamente con `fuente=demo`.
 */
export function obtenerMetricasDemo(
  campaign: { campaign_id: string; campaign_name: string | null; presupuesto_diario?: number | null },
  since: string,
  until: string,
): CampaignAnalytics {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  const days = Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.round((end - start) / 86400000) + 1
    : 1;
  const random = randomGenerator(hashSeed(`${campaign.campaign_id}|${since}|${until}`));
  const dailyBudget = campaign.presupuesto_diario && campaign.presupuesto_diario > 0
    ? campaign.presupuesto_diario
    : 5;

  // Meta no gasta siempre el 100 % del presupuesto diario.
  const gasto = Number((dailyBudget * days * (0.62 + random() * 0.3)).toFixed(2));
  const cpm = 4.2 + random() * 4.6; // USD por mil impresiones
  const impresiones = Math.max(0, Math.round((gasto / cpm) * 1000));
  const clics = Math.max(0, Math.round(impresiones * (0.009 + random() * 0.017)));
  const leads = clics > 0 ? Math.max(1, Math.round(clics * (0.03 + random() * 0.05))) : 0;
  const ctr = impresiones > 0 ? (clics / impresiones) * 100 : null;

  return {
    campaign_id: campaign.campaign_id,
    campaign_name: campaign.campaign_name,
    fuente: 'demo',
    gasto,
    impresiones,
    clics,
    leads,
    ctr: ctr === null ? null : Number(ctr.toFixed(2)),
    cpl: leads > 0 ? Number((gasto / leads).toFixed(2)) : null,
    metricas_disponibles: true,
    actualizado_en: new Date().toISOString(),
  };
}

export async function obtenerMetricasMeta(
  campaign: { campaign_id: string; campaign_name: string | null; meta_campaign_id: string | null },
  credentials: MetaCredentials | null,
  since: string,
  until: string,
): Promise<CampaignAnalytics> {
  if (!credentials || !campaign.meta_campaign_id || campaign.meta_campaign_id.startsWith('META-SIM-')) {
    return { campaign_id: campaign.campaign_id, campaign_name: campaign.campaign_name, fuente: 'meta', gasto: null, impresiones: null, clics: null, leads: null, ctr: null, cpl: null, metricas_disponibles: false, actualizado_en: null };
  }
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/${config.metaOAuth.graphApiVersion}/${encodeURIComponent(campaign.meta_campaign_id)}/insights`,
      {
        params: {
          fields: 'spend,impressions,clicks,actions,date_start,date_stop',
          time_range: JSON.stringify({ since, until }),
          access_token: credentials.accessToken,
        },
        timeout: 15000,
      },
    );
    const row = data?.data?.[0];
    // Meta respondió 200 sin filas: no hubo entrega en el rango (habitual en
    // cuentas sandbox, que no entregan anuncios). Se conserva `actualizado_en`
    // para distinguir «se consultó y no hay datos» de «no se pudo consultar».
    if (!row) return { campaign_id: campaign.campaign_id, campaign_name: campaign.campaign_name, fuente: 'meta', gasto: null, impresiones: null, clics: null, leads: null, ctr: null, cpl: null, metricas_disponibles: false, actualizado_en: new Date().toISOString() };
    const gasto = numero(row.spend);
    const impresiones = numero(row.impressions);
    const clics = numero(row.clicks);
    const leadAction = Array.isArray(row.actions)
      ? row.actions.find((action: { action_type?: string }) => ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(action.action_type ?? ''))
      : undefined;
    const leads = numero(leadAction?.value);
    return {
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      fuente: 'meta',
      gasto,
      impresiones,
      clics,
      leads,
      ctr: clics !== null && impresiones !== null && impresiones > 0 ? clics / impresiones * 100 : null,
      cpl: gasto !== null && leads !== null && leads > 0 ? gasto / leads : null,
      metricas_disponibles: gasto !== null || impresiones !== null || clics !== null || leads !== null,
      actualizado_en: new Date().toISOString(),
    };
  } catch {
    throw new Error('CAMPAIGN_ANALYTICS_PROVIDER_ERROR');
  }
}
