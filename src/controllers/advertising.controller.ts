// controllers/advertising.controller.ts
// IMVOLT Ads: conexiones Meta, borradores de campaña, aprobación, publicación
// e insights. Documento maestro §10.
//
// REGLAS CLAVE:
//  • Nunca se activa gasto sin autorización registrada: los recursos se crean
//    en PAUSED y la publicación exige una aprobación explícita.
//  • Cambiar presupuesto, destino, objetivo o creativo invalida la aprobación
//    previa y devuelve la campaña a `local_draft`.

import { Request, Response } from 'express';
import { createCrudRouter } from '../core/crud.factory';
import { HttpError } from '../core/errors';
import { conexionRequest, campanaRequest, aprobacionRequest } from '../requests/advertising.request';
import { conexionResource, campanaResource, aprobacionResource, insightResource } from '../resources/advertising.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByOrg, assignOrgOnCreate } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin, writeByMarketing } from '../middlewares/requireRole';
import { metaService } from '../services/meta.service';
import supabase from '../config/supabaseClient';

const sendError = (res: Response, error: unknown): void => {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const httpError = error as { statusCode: number; message: string; details?: unknown };
    res.status(httpError.statusCode).json({ message: httpError.message, details: httpError.details });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : 'Error interno del servidor' });
};

// ── Conexiones de cuentas publicitarias ─────────────────────────────────────
export const { router: conexionRouter } = createCrudRouter({
  table: 'meta_connections',
  primaryKey: 'connection_id',
  request: conexionRequest,
  resource: conexionResource,
  entityName: 'Conexión',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Campañas (RF-07 / P0: borrador con creativo, destino y presupuesto) ─────
const campanas = createCrudRouter({
  table: 'campaigns',
  primaryKey: 'campaign_id',
  request: campanaRequest,
  resource: campanaResource,
  entityName: 'Campaña',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByMarketing, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },

  handlers: {
    /** POST /campaigns — siempre nace como borrador local. */
    create: async (req: Request, res: Response) => {
      try {
        const payload = campanaRequest.validateCreate(req.body) as Record<string, unknown>;
        const row = await campanas.service.create({ ...payload, estado: 'local_draft' }, req.userId);
        res.status(201).json(campanaResource.format(row));
      } catch (error) {
        sendError(res, error);
      }
    },

    /** PUT/PATCH /campaigns/:id — un cambio sensible invalida la aprobación. */
    update: async (req: Request, res: Response) => {
      try {
        const payload = campanaRequest.validateUpdate(req.body) as Record<string, unknown>;
        const before = (await campanas.service.getById(req.params.id)) as Record<string, unknown>;
        const row = (await campanas.service.update(req.params.id, payload, req.userId)) as Record<string, unknown>;

        const CAMPOS_SENSIBLES = ['presupuesto_maximo', 'destino', 'objetivo', 'creative_url', 'fecha_inicio', 'fecha_fin'];
        const tocoSensible = CAMPOS_SENSIBLES.some((campo) => campo in payload);
        const aprobada = ['awaiting_approval', 'approved', 'published_paused', 'active'].includes(String(before.estado));

        if (tocoSensible && aprobada && row.estado !== 'local_draft') {
          const reset = (await campanas.service.update(
            req.params.id,
            { estado: 'local_draft' } as never,
            req.userId,
          )) as Record<string, unknown>;
          res.json(campanaResource.format({ ...reset, advertencia: 'Se invalidó la aprobación previa por cambios en la campaña (§10).' }));
          return;
        }

        res.json(campanaResource.format(row));
      } catch (error) {
        sendError(res, error);
      }
    },
  },

  extraRoutes: (router) => {
    /** POST /campaigns/:id/validate — validaciones previas (incluye categoría vivienda). */
    router.post('/:id/validate', async (req: Request, res: Response) => {
      try {
        const campaign = (await campanas.service.getById(req.params.id)) as Record<string, unknown>;
        const { data: connection } = campaign.connection_id
          ? await supabase.from('meta_connections').select('*').eq('connection_id', campaign.connection_id).maybeSingle()
          : { data: null };

        const result = metaService.validate(campaign as never, connection as never);

        if (result.valido) {
          const { data: updated } = await supabase
            .from('campaigns')
            .update({ estado: 'validated', updated_at: new Date().toISOString() })
            .eq('campaign_id', campaign.campaign_id)
            .select()
            .single();

          res.json({ campaign: campanaResource.format(updated ?? campaign), ...result });
          return;
        }

        res.status(400).json({ campaign: campanaResource.format(campaign), ...result });
      } catch (error) {
        sendError(res, error);
      }
    });

    /**
     * POST /campaigns/:id/approve — registra la aprobación autorizada
     * (solo propietario o administrador). RF-08 / P0*.
     */
    router.post('/:id/approve', writeByOwnerOrAdmin, async (req: Request, res: Response) => {
      try {
        const campaign = (await campanas.service.getById(req.params.id)) as Record<string, unknown>;
        const payload = aprobacionRequest.validateCreate(req.body) as { decision: 'aprobada' | 'rechazada'; comentario?: string };

        if (!['validated', 'awaiting_approval'].includes(String(campaign.estado))) {
          throw new HttpError(409, `Solo se puede aprobar una campaña validada (estado actual: ${campaign.estado})`);
        }

        const { data: approval, error: approvalError } = await supabase
          .from('campaign_approvals')
          .insert([
            {
              campaign_id: campaign.campaign_id,
              organization_id: campaign.organization_id,
              aprobado_por: req.userId,
              decision: payload.decision,
              comentario: payload.comentario ?? null,
            },
          ])
          .select()
          .single();

        if (approvalError) throw new Error(approvalError.message);

        const nuevoEstado = payload.decision === 'aprobada' ? 'approved' : 'rejected';
        const { data: updated } = await supabase
          .from('campaigns')
          .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
          .eq('campaign_id', campaign.campaign_id)
          .select()
          .single();

        res.json({ campaign: campanaResource.format(updated ?? campaign), approval: aprobacionResource.format(approval) });
      } catch (error) {
        sendError(res, error);
      }
    });

    /**
     * POST /campaigns/:id/publish — publica en Meta con los recursos en PAUSED.
     * Requiere aprobación previa y rol propietario/administrador (RF-08 / P0*).
     */
    router.post('/:id/publish', writeByOwnerOrAdmin, async (req: Request, res: Response) => {
      try {
        const campaign = (await campanas.service.getById(req.params.id)) as Record<string, unknown>;

        if (campaign.estado !== 'approved') {
          throw new HttpError(409, `La campaña debe estar aprobada para publicarse (estado actual: ${campaign.estado})`);
        }

        const { data: connection } = campaign.connection_id
          ? await supabase.from('meta_connections').select('*').eq('connection_id', campaign.connection_id).maybeSingle()
          : { data: null };

        const result = metaService.validate(campaign as never, connection as never);
        if (!result.valido) throw new HttpError(400, 'La campaña no pasa las validaciones de publicación', result.errores);

        const { meta_campaign_id } = await metaService.publishPaused(campaign as never);

        const { data: updated } = await supabase
          .from('campaigns')
          .update({ estado: 'published_paused', meta_campaign_id, updated_at: new Date().toISOString() })
          .eq('campaign_id', campaign.campaign_id)
          .select()
          .single();

        res.json({
          campaign: campanaResource.format(updated ?? campaign),
          message:
            'Campaña creada en Meta en estado PAUSADO. Activa el presupuesto desde Meta Ads Manager una vez revisada.',
        });
      } catch (error) {
        sendError(res, error);
      }
    });

    /** GET /campaigns/:id/insights — indicadores consolidados + snapshot. */
    router.get('/:id/insights', async (req: Request, res: Response) => {
      try {
        const campaign = (await campanas.service.getById(req.params.id)) as Record<string, unknown>;
        const insights = await metaService.fetchInsights(campaign as never);

        const { data: snapshot } = await supabase
          .from('insights_snapshots')
          .insert([
            {
              campaign_id: campaign.campaign_id,
              organization_id: campaign.organization_id,
              ...insights,
              tomado_en: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        const cpl = insights.leads > 0 ? Number((insights.gasto / insights.leads).toFixed(2)) : null;
        const ctr = insights.impresiones > 0 ? Number(((insights.clics / insights.impresiones) * 100).toFixed(2)) : null;

        res.json({
          campaign_id: campaign.campaign_id,
          ...insights,
          costo_por_lead: cpl,
          ctr,
          fuente: 'Meta (datos directos)' as string,
          snapshot: snapshot ? insightResource.format(snapshot) : null,
        });
      } catch (error) {
        sendError(res, error);
      }
    });

    /**
     * POST /campaigns/:id/export — salida manual de borradores mientras los
     * permisos de Meta estén pendientes (§10).
     */
    router.get('/:id/export', async (req: Request, res: Response) => {
      try {
        const campaign = (await campanas.service.getById(req.params.id)) as Record<string, unknown>;
        const { data: property } = campaign.property_id
          ? await supabase.from('propiedades').select('*').eq('property_id', campaign.property_id).maybeSingle()
          : { data: null };

        res.json({
          titulo: 'Paquete de anuncio IMVOLT (exportación manual)',
          campaña: campanaResource.format(campaign),
          propiedad: property ?? null,
          checklist_de_publicacion: [
            'Copia y título revisados por el anunciante.',
            'Creativo aprobado y fiel a la propiedad real (renders identificados como conceptuales).',
            'Presupuesto máximo y calendario confirmados.',
            'Segmentación compatible con las políticas de vivienda de Meta.',
            'Destino (WhatsApp, formulario o landing) probado antes de activar.',
          ],
        });
      } catch (error) {
        sendError(res, error);
      }
    });
  },
});

export const { router: campanaRouter } = campanas;
