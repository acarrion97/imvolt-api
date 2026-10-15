// controllers/creative.controller.ts
// IMVOLT Studio: plantillas, registro de modelos, trabajos de generación IA
// y estratega inmobiliario. Documento maestro §07 (estudio), §08 (estratega)
// y §09 (Higgsfield).

import { Request, Response, Router } from 'express';
import { createCrudRouter } from '../core/crud.factory';
import { NotFoundError, HttpError } from '../core/errors';
import { plantillaRequest, modeloRequest, generacionRequest, estrategaRequest } from '../requests/creative.request';
import { plantillaResource, modeloResource, generacionResource } from '../resources/creative.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByOrg, assignOrgOnCreate } from '../middlewares/tenantScope';
import { writeByMarketing, writeByOwnerOrAdmin } from '../middlewares/requireRole';
import { higgsfieldService } from '../services/higgsfield.service';
import { creditsService } from '../services/credits.service';
import { strategistService } from '../services/strategist.service';
import { Propiedad } from '../models/catalog.model';
import supabase from '../config/supabaseClient';

const sendError = (res: Response, error: unknown): void => {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const httpError = error as { statusCode: number; message: string; details?: unknown };
    res.status(httpError.statusCode).json({ message: httpError.message, details: httpError.details });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : 'Error interno del servidor' });
};

/** Trae los outputs de una lista de jobs y los adjunta como `generation_outputs`. */
async function withOutputs(jobs: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const ids = jobs.map((job) => String(job.generation_id));
  if (ids.length === 0) return jobs;

  const { data: outputRows } = await supabase.from('generation_outputs').select('*').in('generation_id', ids);

  const byJob = new Map<string, unknown[]>();
  ((outputRows ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const key = String(row.generation_id);
    byJob.set(key, [...(byJob.get(key) ?? []), row]);
  });

  return jobs.map((job) => ({ ...job, generation_outputs: byJob.get(String(job.generation_id)) ?? [] }));
}

// ── Plantillas (RF-04 / P0: prompts con campos reales, sin atributos inventados)
export const { router: plantillaRouter } = createCrudRouter({
  table: 'ai_templates',
  primaryKey: 'template_id',
  request: plantillaRequest,
  resource: plantillaResource,
  entityName: 'Plantilla',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByMarketing, assignOrgOnCreate],
  defaultGetAllOptions: { orderBy: 'nombre', ascending: true },
  handlers: {
    // La biblioteca muestra las plantillas del sistema (organization_id null)
    // junto con las propias de la organización.
    getAll: async (req: Request, res: Response) => {
      try {
        const { data, error } = await supabase
          .from('ai_templates')
          .select('*')
          .or(`organization_id.is.null,organization_id.eq.${req.organizationId}`)
          .order('nombre', { ascending: true });

        if (error) throw new Error(error.message);
        res.json(plantillaResource.formatMany(data ?? []));
      } catch (error) {
        sendError(res, error);
      }
    },
  },
});

// ── Registro de modelos (catálogo dinámico, §20: no hardcodear) ─────────────
export const { router: modeloRouter } = createCrudRouter({
  table: 'model_registry',
  primaryKey: 'model_id',
  request: modeloRequest,
  resource: modeloResource,
  entityName: 'Modelo',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin],
  defaultGetAllOptions: { orderBy: 'nombre', ascending: true },
});

// ── Generaciones (RF-05 / P0 y RF-06: cotización + ledger sin doble cargo) ──
const generaciones = createCrudRouter({
  table: 'generation_jobs',
  primaryKey: 'generation_id',
  request: generacionRequest,
  resource: generacionResource,
  entityName: 'Generación',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByMarketing],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },

  handlers: {
    /**
     * POST /generations — cotiza, reserva créditos y crea el job en Higgsfield.
     * Máquina de estados (§09): created → credits_reserved → queued.
     */
    create: async (req: Request, res: Response) => {
      try {
        const payload = generacionRequest.validateCreate(req.body) as {
          property_id?: string | null;
          template_id?: string | null;
          model_id: string;
          modo: 'facil' | 'pro';
          prompt: string;
          parametros: Record<string, unknown>;
          idempotency_key?: string;
        };

        const { data: model, error: modelError } = await supabase
          .from('model_registry')
          .select('*')
          .eq('model_id', payload.model_id)
          .maybeSingle();

        if (modelError) throw new Error(modelError.message);
        if (!model) throw new NotFoundError('Modelo de IA');
        if (model.status === 'no_disponible') {
          throw new HttpError(409, `El modelo "${model.nombre}" no está disponible temporalmente`);
        }

        const quote = higgsfieldService.quote({
          media_type: model.media_type,
          provider_model_id: model.provider_model_id,
          prompt: payload.prompt,
          duration: payload.parametros.duration as number | undefined,
        });
        const creditsCost = quote.creditos;

        // 1. Job en estado created
        const { data: job, error: jobError } = await supabase
          .from('generation_jobs')
          .insert([
            {
              organization_id: req.organizationId,
              property_id: payload.property_id ?? null,
              template_id: payload.template_id ?? null,
              model_id: payload.model_id,
              modo: payload.modo,
              prompt: payload.prompt,
              parametros: payload.parametros,
              status: 'created',
              credits_cost: creditsCost,
            },
          ])
          .select()
          .single();

        if (jobError) throw new Error(jobError.message);
        const generationId = job.generation_id as string;

        try {
          // 2. Reserva de créditos (RF-06: idempotente por generation_id)
          await creditsService.reserve(req.organizationId!, creditsCost, generationId, payload.idempotency_key);
          await supabase
            .from('generation_jobs')
            .update({ status: 'credits_reserved', updated_at: new Date().toISOString() })
            .eq('generation_id', generationId);

          // 3. Envío al proveedor
          const providerJob = await higgsfieldService.createJob({
            provider_model_id: model.provider_model_id,
            media_type: model.media_type,
            prompt: payload.prompt,
            image_url: payload.parametros.image_url as string | undefined,
            duration: payload.parametros.duration as number | undefined,
            ratio: payload.parametros.ratio as string | undefined,
            resolution: payload.parametros.resolution as string | undefined,
          });

          const { data: queued } = await supabase
            .from('generation_jobs')
            .update({
              status: 'queued',
              provider_request_id: providerJob.request_id,
              updated_at: new Date().toISOString(),
            })
            .eq('generation_id', generationId)
            .select()
            .single();

          res.status(201).json(generacionResource.format({ ...(queued ?? job), generation_outputs: [] }));
        } catch (providerError) {
          // El proveedor o la reserva fallaron: se libera la reserva (§09, paso 7).
          await creditsService.refund(req.organizationId!, creditsCost, generationId).catch(() => undefined);
          await supabase
            .from('generation_jobs')
            .update({
              status: 'failed',
              error_message: providerError instanceof Error ? providerError.message : 'Error del proveedor',
              updated_at: new Date().toISOString(),
            })
            .eq('generation_id', generationId);
          throw providerError;
        }
      } catch (error) {
        sendError(res, error);
      }
    },

    /** GET /generations — lista los jobs de la organización con sus outputs. */
    getAll: async (req: Request, res: Response) => {
      try {
        const jobs = (await generaciones.service.getAll({
          where: { organization_id: req.organizationId },
          orderBy: 'created_at',
          ascending: false,
        })) as Array<Record<string, unknown>>;

        res.json(generacionResource.formatMany(await withOutputs(jobs)));
      } catch (error) {
        sendError(res, error);
      }
    },

    /** GET /generations/:id — consulta estado; si el proveedor terminó, concilia créditos. */
    getById: async (req: Request, res: Response) => {
      try {
        const job = (await generaciones.service.getById(req.params.id)) as Record<string, unknown>;

        if (['queued', 'processing'].includes(String(job.status)) && job.provider_request_id) {
          const providerStatus = await higgsfieldService.getStatus(String(job.provider_request_id));

          if (providerStatus.status === 'completed' && providerStatus.result_url) {
            const { data: model } = await supabase
              .from('model_registry')
              .select('media_type')
              .eq('model_id', job.model_id)
              .maybeSingle();

            await supabase.from('generation_outputs').insert([
              {
                generation_id: job.generation_id,
                organization_id: job.organization_id,
                url: providerStatus.result_url,
                tipo: model?.media_type ?? 'image',
                es_conceptual: false,
                version: 1,
              },
            ]);

            await creditsService.confirm(
              String(job.organization_id),
              Number(job.credits_cost),
              String(job.generation_id),
            );
            job.status = 'completed';
            await supabase
              .from('generation_jobs')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .eq('generation_id', job.generation_id);
          } else if (providerStatus.status === 'failed') {
            await creditsService.refund(String(job.organization_id), Number(job.credits_cost), String(job.generation_id));
            job.status = 'failed';
            job.error_message = providerStatus.error ?? 'El proveedor no pudo completar el trabajo';
            await supabase
              .from('generation_jobs')
              .update({ status: 'failed', error_message: job.error_message, updated_at: new Date().toISOString() })
              .eq('generation_id', job.generation_id);
          } else {
            job.status = providerStatus.status === 'processing' ? 'processing' : 'queued';
          }
        }

        const { data: outputs } = await supabase
          .from('generation_outputs')
          .select('*')
          .eq('generation_id', job.generation_id);

        res.json(generacionResource.format({ ...job, generation_outputs: outputs ?? [] }));
      } catch (error) {
        sendError(res, error);
      }
    },
  },

  extraRoutes: (router) => {
    /**
     * POST /generations/:id/cancel — cancelación elegible + devolución de créditos.
     * Solo aplica antes de que el proveedor procese el trabajo.
     */
    router.post('/:id/cancel', async (req: Request, res: Response) => {
      try {
        const job = (await generaciones.service.getById(req.params.id)) as Record<string, unknown>;
        const elegibles = ['created', 'quoted', 'credits_reserved', 'queued'];

        if (!elegibles.includes(String(job.status))) {
          throw new HttpError(409, `No se puede cancelar una generación en estado "${job.status}"`);
        }

        await creditsService.refund(String(job.organization_id), Number(job.credits_cost), String(job.generation_id));

        const { data: updated } = await supabase
          .from('generation_jobs')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('generation_id', job.generation_id)
          .select()
          .single();

        res.json(generacionResource.format({ ...(updated ?? job), generation_outputs: [] }));
      } catch (error) {
        sendError(res, error);
      }
    });
  },
});

export const { router: generacionRouter } = generaciones;

// ── Estratega inmobiliario (§08): salida estructurada y auditable ───────────
export const estrategaRouter = Router();

estrategaRouter.post('/', ...requireOrg, async (req: Request, res: Response) => {
  try {
    const payload = estrategaRequest.validateCreate(req.body) as { property_id: string; objetivo: string };

    const { data: propiedad } = await supabase
      .from('propiedades')
      .select('*')
      .eq('property_id', payload.property_id)
      .eq('organization_id', req.organizationId)
      .maybeSingle();

    if (!propiedad) throw new NotFoundError('Propiedad');

    res.json(
      strategistService.build({
        propiedad: propiedad as unknown as Propiedad,
        objetivo: payload.objetivo as 'visitas' | 'mensajes' | 'formularios' | 'branding',
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});
