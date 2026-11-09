import { BaseModel } from '../../core';

/**
 * Plan comercial. `limite_usuarios` y los cuatro límites de uso son las
 * RESTRICCIONES que la API valida antes de crear recursos (ver
 * `services/plan-limits.service.ts`). `caracteristicas` es texto derivado que
 * solo sirve para mostrar en la UI; `null` en un límite = sin restricción.
 */
export interface Plan extends BaseModel<Plan> {
  plan_id: number;
  nombre: string;
  descripcion: string;
  precio_mensual: number;
  limite_usuarios: number;
  limite_proyectos: number | null;
  limite_imagenes_ia: number | null;
  limite_videos_ia: number | null;
  limite_campanias_meta: number | null;
  caracteristicas: string[];
  estado: 'activo' | 'inactivo';
}
