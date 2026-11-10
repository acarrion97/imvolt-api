import axios from 'axios';
import { config } from '../config/global';
import type { MetaCredentials } from './meta.service';

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string | null;
  fuente: 'meta';
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
    if (!row) return { campaign_id: campaign.campaign_id, campaign_name: campaign.campaign_name, fuente: 'meta', gasto: null, impresiones: null, clics: null, leads: null, ctr: null, cpl: null, metricas_disponibles: false, actualizado_en: null };
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
