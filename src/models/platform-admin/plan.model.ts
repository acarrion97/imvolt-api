import { BaseModel } from '../../core';

export interface Plan extends BaseModel<Plan> {
  plan_id: number;
  nombre: string;
  descripcion: string;
  precio_mensual: number;
  limite_usuarios: number;
  caracteristicas: string[];
}
