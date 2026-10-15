// models/catalog.model.ts
// Catálogo inmobiliario: proyectos, propiedades, medios y brand kit.
// Documento maestro §06 (MVP) y §13 (modelo de datos).

export type TipoProyecto = 'lotizacion' | 'urbanizacion' | 'edificio' | 'proyecto_planos' | 'individual';
export type EstadoProyecto = 'activo' | 'pausado' | 'terminado';

export interface Proyecto {
  project_id: string;
  organization_id: string;
  nombre: string;
  tipo: TipoProyecto;
  descripcion: string | null;
  ubicacion: string | null;
  total_lotes: number | null;
  estado: EstadoProyecto;
  created_at: string;
}

export type CategoriaPropiedad = 'lote' | 'casa' | 'departamento' | 'oficina' | 'local' | 'proyecto';
export type EstadoPropiedad = 'disponible' | 'reservada' | 'vendida' | 'no_disponible';

export interface Propiedad {
  property_id: string;
  organization_id: string;
  project_id: string | null;
  nombre: string;
  categoria: CategoriaPropiedad;
  titulo_publicacion: string | null;
  descripcion: string | null;
  precio: number | null;
  moneda: string;
  superficie_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  direccion: string | null;
  ciudad: string | null;
  pais: string;
  estado: EstadoPropiedad;
  /** true cuando las imágenes incluyen renders/escenas conceptuales. */
  tiene_render_conceptual: boolean;
  created_at: string;
}

export type TipoMedia = 'foto' | 'render' | 'video' | 'plano' | 'documento';

export interface MediaAsset {
  media_id: string;
  organization_id: string;
  property_id: string | null;
  tipo: TipoMedia;
  nombre: string;
  url: string;
  /** La fotografía original autorizada que la IA debe preservar. */
  es_referencia_original: boolean;
  created_at: string;
}

export interface BrandKit {
  brand_kit_id: string;
  organization_id: string;
  nombre: string;
  logo_url: string | null;
  color_primario: string | null;
  color_secundario: string | null;
  tipografia: string | null;
  created_at: string;
}
