// models/advertising.model.ts
// Tipos compartidos del módulo de publicidad (IMVOLT Ads / Meta).

/** Conexión con una cuenta de anuncios de Meta. */
export interface MetaConnection {
  connection_id: string;
  empresa_id: number;
  ad_account_id: string;
  /** Cifrada en servidor: jamás se devuelve al navegador. */
  access_token_enc: string | null;
  estado: 'conectada' | 'desconectada' | 'error';
  conectada_en: string | null;
}

/** Borrador/campaña local antes de publicarse en Meta (siempre PAUSED). */
export interface Campana {
  campaign_id: string;
  empresa_id: number;
  /** 'whatsapp' | 'formulario' | 'landing' */
  destino: string;
  /** 'mensajes' | 'formularios' | 'visitas' | 'trafico' | 'branding' */
  objetivo: string;
  titulo: string;
  copy: string;
  creative_url: string | null;
  presupuesto_maximo: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: 'local_draft' | 'validated' | 'approved' | 'published_paused' | 'archived';
}
