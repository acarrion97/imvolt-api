// services/meta.service.ts
// Adaptador de Meta Marketing API para IMVOLT Ads (documento maestro, §10).
//
// REGLA DE CONFIANZA (§10 "CONTROL DE GASTO"): IMVOLT jamás activa gasto
// publicitario ni modifica presupuestos sin autorización registrada. Los
// recursos se crean siempre en PAUSED cuando el flujo de API lo permite.
//
// Sin META_APP_ID (o con META_SIMULATE=true) el servicio opera en modo
// simulado: crea IDs ficticios y devuelve insights de demostración, para
// desarrollar el flujo completo de borrador → aprobación → publicación
// pausada sin permisos de Meta.

import { config } from '../config/global';
import { HttpError } from '../core/errors';
import { Campana, MetaConnection } from '../models/advertising.model';

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

export const metaService = { validate, publishPaused, fetchInsights };
