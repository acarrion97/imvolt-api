// models/brandkit/brand_color.model.ts
// Color de la paleta corporativa de la empresa (Brand Kit).

import { BaseModel } from '../../core';
import { Empresa } from '../identity/empresa.model';

/** Roles que un color puede cumplir dentro de la identidad. */
export const USOS_COLOR = ['principal', 'secundario', 'acento', 'fondo', 'texto'] as const;

export type UsoColor = (typeof USOS_COLOR)[number];

export interface BrandColor extends BaseModel<BrandColor> {
  brand_color_id: number;
  nombre: string;
  /** Código hexadecimal (#RRGGBB). */
  hex: string;
  uso: UsoColor;
  /** Orden de presentación en la paleta. */
  orden: number;
  empresa_id: number;
}

/** MODELO DE VISUALIZACIÓN: el color con su empresa incrustada. */
export interface BrandColorView extends BrandColor {
  /** Relación incrustada (FK → empresas). */
  empresa: Empresa | null;
}
