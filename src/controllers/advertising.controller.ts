// controllers/advertising.controller.ts
// CRUD del módulo Publicidad (IMVOLT Ads): objetivos y campañas publicitarias.

import { Request, Response } from 'express';
import supabase from '../config/supabaseClient';
import { createCrudRouter } from '../core/crud.factory';
import { errorResponse, HttpError, NotFoundError, ValidationError } from '../core/errors';
import { logAudit } from '../services/audit.service';
import { metaService, MetaCredentials } from '../services/meta.service';
import { campaniaPublicitariaRequest, objetivoPublicidadRequest } from '../requests/advertising.request';
import { campaniaPublicitariaResource, objetivoPublicidadResource } from '../resources/advertising.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { requirePermission, writeByMarketing, writeByPlatformAdmin } from '../middlewares/requireRole';
import { requireOwnedRef } from '../middlewares/tenantScope';

// Catálogo GLOBAL de objetivos: escritura solo de la plataforma.
const SEGMENTO = {
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByPlatformAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
};

// ── Objetivos de publicidad (catálogo compartido) ───────────────────────────
export const { router: objetivoPublicidadRouter } = createCrudRouter({
  table: 'objetivo_publicidad',
  primaryKey: 'objetivo_publicidad_id',
  request: objetivoPublicidadRequest,
  resource: objetivoPublicidadResource,
  entityName: 'Objetivo de publicidad',
  ...SEGMENTO,
});

// ── Publicación en Meta ─────────────────────────────────────────────────────

/** Credenciales de Meta Ads de la empresa: integración "Meta Ads" activa + su configuración. */
async function credencialesMeta(empresaId: string): Promise<MetaCredentials | null> {
  const { data, error } = await supabase
    .from('empresas_integraciones')
    .select('integraciones!inner(nombre), configuraciones_integraciones!inner(api_id, access_token, estado, empresa_id)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .eq('integraciones.nombre', 'Meta Ads');
  if (error) throw new Error(error.message);

  for (const fila of (data ?? []) as unknown as Array<{ configuraciones_integraciones: any }>) {
    const cfg = fila.configuraciones_integraciones;
    // La credencial debe ser de la misma empresa, estar activa y completa.
    if (cfg && String(cfg.empresa_id) === empresaId && cfg.estado === 'activo' && cfg.api_id && cfg.access_token) {
      return { adAccountId: String(cfg.api_id), accessToken: String(cfg.access_token) };
    }
  }
  return null;
}

/**
 * POST /:id/publicar — crea la campaña en Meta en estado PAUSED (nunca activa
 * gasto). Body opcional: `{ "validar_solo": true }` valida con Meta sin crear.
 */
async function publicarEnMeta(req: Request, res: Response): Promise<void> {
  let reservada = false;
  const id = Number(req.params.id);
  try {
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Identificador inválido');
    const validarSolo = req.body?.validar_solo === true;

    const { data: campania, error } = await supabase
      .from('campanias_publicitarias')
      .select('*, propiedades(empresa_id), objetivo_publicidad(nombre)')
      .eq('campania_publicitaria_id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Una campaña de otra empresa es indistinguible de una inexistente.
    if (!campania || String(campania.propiedades?.empresa_id) !== req.organizationId) {
      throw new NotFoundError('Campaña publicitaria');
    }
    if (campania.estado === 'inactivo') throw new ValidationError('La campaña está inactiva');
    if (campania.meta_campaign_id || campania.meta_estado) {
      throw new HttpError(409, 'La campaña ya fue publicada (o se está publicando) en Meta');
    }
    if (!(Number(campania.presupuesto_diario) > 0)) {
      throw new ValidationError('El presupuesto diario debe ser mayor a cero');
    }

    const credentials = await credencialesMeta(req.organizationId as string);
    if (!credentials) {
      throw new ValidationError('Tu empresa no tiene una integración de Meta Ads activa y completa', [
        { field: 'integracion', message: 'Configura api_id (cuenta publicitaria) y access_token de Meta Ads' },
      ]);
    }
    const input = {
      campaniaId: id,
      objetivo: String(campania.objetivo_publicidad?.nombre ?? ''),
      credentials,
    };

    if (validarSolo) {
      const r = await metaService.publishCampaniaPaused({ ...input, validateOnly: true });
      res.json({ message: 'Validación correcta: no se creó nada en Meta', ...r });
      return;
    }

    // Reserva atómica: solo UNA petición concurrente pasa de "sin publicar" a "publicando".
    const { data: reserva, error: errReserva } = await supabase
      .from('campanias_publicitarias')
      .update({ meta_estado: 'publicando' })
      .eq('campania_publicitaria_id', id)
      .is('meta_campaign_id', null)
      .is('meta_estado', null)
      .select('campania_publicitaria_id');
    if (errReserva) throw new Error(errReserva.message);
    if (!reserva?.length) throw new HttpError(409, 'La campaña ya se está publicando en Meta');
    reservada = true;

    const r = await metaService.publishCampaniaPaused(input);

    const { error: errGuardar } = await supabase
      .from('campanias_publicitarias')
      .update({ meta_campaign_id: r.meta_campaign_id, meta_estado: 'published_paused', publicada_en: new Date().toISOString() })
      .eq('campania_publicitaria_id', id);
    if (errGuardar) {
      // La campaña YA existe en Meta (pausada): no se libera la reserva para no duplicarla.
      reservada = false;
      console.error('[meta] campaña creada en Meta pero no se pudo guardar su ID', id, r.meta_campaign_id);
      throw new Error(errGuardar.message);
    }
    reservada = false;

    await logAudit('campanias_publicitarias', 'UPDATE', id, { accion: 'publicar_meta', meta_campaign_id: r.meta_campaign_id, simulado: r.simulado }, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId,
    });

    res.status(201).json({
      message: r.simulado ? 'Campaña publicada en modo SIMULADO (pausada)' : 'Campaña creada en Meta en estado PAUSADO',
      campania_publicitaria_id: id,
      meta_estado: 'published_paused',
      ...r,
    });
  } catch (error) {
    if (reservada) {
      // Meta no creó nada: libera la reserva para poder reintentar.
      await supabase.from('campanias_publicitarias').update({ meta_estado: null }).eq('campania_publicitaria_id', id).is('meta_campaign_id', null);
    }
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
}

// ── Campañas publicitarias ──────────────────────────────────────────────────
export const { router: campaniaPublicitariaRouter } = createCrudRouter({
  table: 'campanias_publicitarias',
  primaryKey: 'campania_publicitaria_id',
  joins: ['propiedades(*, empresas(*), tipos_propiedades(*))', 'objetivo_publicidad(*)'],
  request: campaniaPublicitariaRequest,
  resource: campaniaPublicitariaResource,
  entityName: 'Campaña publicitaria',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByMarketing, requireOwnedRef('propiedad_id', 'propiedades', 'propiedad_id')],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  // Sin columna de empresa: el dueño es el de su propiedad.
  tenantVia: { fk: 'propiedad_id', table: 'propiedades', pk: 'propiedad_id' },
  extraRoutes: (router) => {
    router.post('/:id/publicar', ...requireOrg, writeByMarketing, requirePermission('gestionar_campanas'), publicarEnMeta);
  },
});
