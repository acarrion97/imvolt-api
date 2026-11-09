import { RequestHandler, Router } from 'express';
import supabase from '../config/supabaseClient';
import { errorResponse, HttpError } from '../core/errors';
import { manageIntegrations, writeByOwnerOrAdmin } from '../middlewares/requireRole';
import { requireOrg } from '../middlewares/sessionAuth';
import { logAudit } from '../services/audit.service';
import {
  getInventorySnapshot,
  LotesLote,
  LotesProyecto,
} from '../services/lotes-almando.service';

interface SyncProject {
  id_externo: string;
  nombre: string;
  total_lotes: number;
}

interface SyncLot {
  id_proyecto_externo: string;
  id_externo: string;
  nombre: string;
  ubicacion: string;
  precio: number;
  disponibilidad: 'disponible' | 'reservada' | 'vendida' | 'no_disponible';
  descripcion: string;
}

function mapAvailability(status: string): SyncLot['disponibilidad'] {
  switch (status) {
    case 'disponible':
      return 'disponible';
    case 'reservado':
      return 'reservada';
    case 'vendido':
      return 'vendida';
    default:
      return 'no_disponible';
  }
}

function buildLotDescription(lot: LotesLote): string {
  return [
    `Sincronizado desde Lotes al Mando (lote externo ${lot.id_lote}).`,
    lot.codigo_catastral ? `Código catastral: ${lot.codigo_catastral}.` : null,
    lot.superficie_m2 != null ? `Superficie: ${lot.superficie_m2} m².` : null,
    lot.medidas ? `Medidas: ${lot.medidas}.` : null,
  ].filter(Boolean).join(' ');
}

function buildSyncPayload(snapshot: Awaited<ReturnType<typeof getInventorySnapshot>>): {
  proyectos: SyncProject[];
  lotes: SyncLot[];
  lotesSinPrecio: number;
  lotesSinProyecto: number;
} {
  const projectById = new Map<number, LotesProyecto>(
    snapshot.proyectos.map((project) => [project.id_proyecto, project]),
  );
  const stageById = new Map(snapshot.etapas.map((stage) => [stage.id_etapa, stage]));
  const blockById = new Map(snapshot.manzanas.map((block) => [block.id_manzana, block]));
  const lotCountByProject = new Map<number, number>();
  const matchedLots: Array<{ lot: LotesLote; project: LotesProyecto; location: string }> = [];
  let lotesSinProyecto = 0;
  let lotesSinPrecio = 0;

  for (const lot of snapshot.lotes) {
    const block = blockById.get(lot.id_manzana);
    const stage = block ? stageById.get(block.id_etapa) : undefined;
    const project = stage ? projectById.get(stage.id_proyecto) : undefined;
    if (!project) {
      lotesSinProyecto += 1;
      continue;
    }

    lotCountByProject.set(project.id_proyecto, (lotCountByProject.get(project.id_proyecto) ?? 0) + 1);
    if (lot.precio_lista == null || !Number.isFinite(Number(lot.precio_lista)) || Number(lot.precio_lista) <= 0) {
      lotesSinPrecio += 1;
      continue;
    }

    const location = [
      project.nombre,
      stage?.nombre,
      block?.nombre_codigo ? `Manzana ${block.nombre_codigo}` : null,
    ].filter(Boolean).join(' · ');
    matchedLots.push({ lot, project, location });
  }

  const proyectos = snapshot.proyectos.map((project) => ({
    id_externo: String(project.id_proyecto),
    nombre: project.nombre,
    total_lotes: lotCountByProject.get(project.id_proyecto) ?? 0,
  }));
  const lotes = matchedLots.map(({ lot, project, location }) => {
    const reference = lot.numero_lote || lot.codigo_catastral || String(lot.id_lote);
    return {
      id_proyecto_externo: String(project.id_proyecto),
      id_externo: String(lot.id_lote),
      nombre: `Lote ${reference}`,
      ubicacion: location,
      precio: Number(lot.precio_lista),
      disponibilidad: mapAvailability(lot.estado),
      descripcion: buildLotDescription(lot),
    };
  });

  return { proyectos, lotes, lotesSinPrecio, lotesSinProyecto };
}

const sincronizarInventario: RequestHandler = async (req, res) => {
  try {
    if (!req.organizationId) throw new HttpError(401, 'Sesión de empresa no iniciada.');

    const snapshot = await getInventorySnapshot(req.organizationId);
    const payload = buildSyncPayload(snapshot);
    const { data, error } = await supabase.rpc('sync_lotes_al_mando_inventory', {
      p_empresa_id: Number(req.organizationId),
      p_proyectos: payload.proyectos,
      p_lotes: payload.lotes,
    });

    if (error) {
      throw new HttpError(503, `No se pudo guardar la sincronización de inventario: ${error.message}`);
    }

    const result = data as {
      proyectos_sincronizados?: number;
      lotes_sincronizados?: number;
    } | null;
    if (!result || typeof result !== 'object') {
      throw new HttpError(502, 'La sincronización no devolvió un resultado válido.');
    }

    await logAudit(
      'lotes_al_mando_mappings',
      'UPDATE',
      null,
      {
        proyectos_sincronizados: result.proyectos_sincronizados ?? 0,
        lotes_sincronizados: result.lotes_sincronizados ?? 0,
        lotes_sin_precio_omitidos: payload.lotesSinPrecio,
        lotes_sin_proyecto_omitidos: payload.lotesSinProyecto,
      },
      {
        authUserId: req.userId,
        usuarioId: req.localUsuarioId,
        empresaId: req.organizationId,
      },
    );

    res.json({
      message: 'Inventario de Lotes al Mando sincronizado.',
      proyectos_sincronizados: result.proyectos_sincronizados ?? 0,
      lotes_sincronizados: result.lotes_sincronizados ?? 0,
      lotes_sin_precio_omitidos: payload.lotesSinPrecio,
      lotes_sin_proyecto_omitidos: payload.lotesSinProyecto,
      sincronizado_en: new Date().toISOString(),
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

export const lotesAlMandoRouter = Router();
lotesAlMandoRouter.post(
  '/sync',
  ...requireOrg,
  writeByOwnerOrAdmin,
  manageIntegrations,
  sincronizarInventario,
);
