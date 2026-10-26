// models/catalog/proyecto.model.ts
// Proyecto inmobiliario: un desarrollo que agrupa varias propiedades
// (`propiedades.proyecto_id`). Las propiedades sueltas pueden no tener proyecto.

import { BaseModel } from '../../core';
import { Empresa } from '../identity/empresa.model';

/**
 * Tipos de proyecto (catálogo fijo validado por Joi). Alineados al frontend
 * (`imvolt/src/domain/proyecto`).
 */
export const TIPOS_PROYECTO = [
  'lotizacion',
  'urbanizacion',
  'edificio',
  'proyecto_planos',
  'individual',
] as const;

export type TipoProyecto = (typeof TIPOS_PROYECTO)[number];

export interface Proyecto extends BaseModel<Proyecto> {
  proyecto_id: number;
  nombre: string;
  tipo: TipoProyecto;
  descripcion: string | null;
  ubicacion: string | null;
  total_lotes: number | null;
  empresa_id: number;
}

/** MODELO DE VISUALIZACIÓN: el proyecto con su empresa incrustada. */
export interface ProyectoView extends Proyecto {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
}
