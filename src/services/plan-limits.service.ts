// services/plan-limits.service.ts
// LÍMITES DE USO POR PLAN.
//
// Los beneficios comerciales de un plan ("10 proyectos", "120 imágenes IA"…)
// se guardan como columnas numéricas en `planes` y se validan AQUÍ antes de
// crear el recurso. Un límite en `null` (o una empresa sin plan) no restringe.
//
//   exigirLimiteDePlan(empresaId, 'proyectos')   → lanza HttpError(403) si ya
//                                                  se alcanzó el máximo
//
// Los puntos de enganche son los middlewares `limitarPorPlan(...)` (altas CRUD)
// y la llamada directa en `generationCreate`, que es el único lugar que sabe
// si la generación es de imagen o de video.

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';

/** Recurso cuyo consumo se acota con el plan de la empresa. */
export type LimiteRecurso =
  | 'proyectos'
  | 'imagenes_ia'
  | 'videos_ia'
  | 'campanias_meta'
  | 'usuarios';

interface EtiquetaLimite {
  /** Columna de `planes` con el máximo. */
  campo: string;
  singular: string;
  plural: string;
}

const ETIQUETAS: Record<LimiteRecurso, EtiquetaLimite> = {
  proyectos: { campo: 'limite_proyectos', singular: 'proyecto', plural: 'proyectos' },
  imagenes_ia: { campo: 'limite_imagenes_ia', singular: 'imagen IA', plural: 'imágenes IA' },
  videos_ia: { campo: 'limite_videos_ia', singular: 'video IA', plural: 'videos IA' },
  campanias_meta: { campo: 'limite_campanias_meta', singular: 'campaña Meta', plural: 'campañas Meta' },
  usuarios: { campo: 'limite_usuarios', singular: 'miembro del equipo', plural: 'miembros del equipo' },
};

interface LimiteResuelto {
  /** Nombre del plan asignado, si lo hay (para el mensaje de error). */
  nombrePlan: string | null;
  /** Máximo permitido, o `null` cuando no hay restricción que aplicar. */
  limite: number | null;
}

/** Lee el plan de la empresa y devuelve el máximo para el recurso pedido. */
async function resolverLimite(empresaId: string, recurso: LimiteRecurso): Promise<LimiteResuelto> {
  const { campo } = ETIQUETAS[recurso];
  const { data, error } = await supabase
    .from('empresas')
    .select(
      `plan_id, planes(plan_id, nombre, limite_usuarios, limite_proyectos,
        limite_imagenes_ia, limite_videos_ia, limite_campanias_meta)`
    )
    .eq('empresa_id', Number(empresaId))
    .maybeSingle();

  if (error) throw new Error(error.message);

  const fila = data as {
    plan_id: number | null;
    planes: Record<string, unknown> | null;
  } | null;

  // Sin plan asignado no hay restricción que resolver (fail-open documentado).
  if (!fila?.plan_id || !fila.planes) return { nombrePlan: null, limite: null };

  const valor = fila.planes[campo];
  return {
    nombrePlan: String(fila.planes.nombre ?? ''),
    limite: valor == null ? null : Number(valor),
  };
}

/** Consumo actual de la empresa para el recurso indicado. */
async function contarUso(empresaId: string, recurso: LimiteRecurso): Promise<number> {
  const empresa = Number(empresaId);

  // Cada consulta se construye por separado: encadenar `.eq` sobre una unión
  // de builders de Supabase no infiere un único tipo.
  switch (recurso) {
    case 'proyectos': {
      const { count, error } = await supabase
        .from('proyectos')
        .select('proyecto_id', { count: 'exact', head: true })
        .eq('empresa_id', empresa);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    case 'campanias_meta': {
      const { count, error } = await supabase
        .from('campanias_publicitarias')
        .select('campania_publicitaria_id', { count: 'exact', head: true })
        .eq('empresa_id', empresa);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    case 'usuarios': {
      // Solo los miembros activos consumen cupo: dar de baja libera el asiento.
      const { count, error } = await supabase
        .from('usuarios')
        .select('usuario_id', { count: 'exact', head: true })
        .eq('empresa_id', empresa)
        .eq('estado', 'activo');
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    case 'imagenes_ia':
    case 'videos_ia': {
      // La tabla `generaciones` no guarda el tipo: vive en `modelos_ia`.
      const tipoMedia = recurso === 'imagenes_ia' ? 'image' : 'video';
      const { data: modelos, error: modelosError } = await supabase
        .from('modelos_ia')
        .select('modelo_id')
        .eq('tipo_media', tipoMedia);
      if (modelosError) throw new Error(modelosError.message);

      const modeloIds = (modelos ?? []).map((modelo) => modelo.modelo_id);
      if (modeloIds.length === 0) return 0;

      const { count, error } = await supabase
        .from('generaciones')
        .select('generacion_id', { count: 'exact', head: true })
        .eq('empresa_id', empresa)
        .in('modelo_id', modeloIds);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }
  }
}

/**
 * Lanza `HttpError(403)` si la empresa ya alcanzó el máximo que su plan
 * permite para `recurso`. Si no hay plan o el límite está en `null`, no hace
 * nada: solo se restringe lo que el plan declara explícitamente.
 */
export async function exigirLimiteDePlan(empresaId: string, recurso: LimiteRecurso): Promise<void> {
  const { nombrePlan, limite } = await resolverLimite(empresaId, recurso);
  if (limite == null) return;

  const usado = await contarUso(empresaId, recurso);
  if (usado < limite) return;

  const { singular, plural } = ETIQUETAS[recurso];
  const unidad = limite === 1 ? singular : plural;
  const plan = nombrePlan ? `Tu plan ${nombrePlan}` : 'Tu plan';

  throw new HttpError(
    403,
    `${plan} permite ${limite} ${unidad} y ya tienes ${usado}. Actualiza tu plan para continuar.`
  );
}
