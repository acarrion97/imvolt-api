// models/advertising/conexion.model.ts
// Cuenta publicitaria de Meta vinculada a la empresa (§10).
//
// Contrato expuesto en `GET/POST /api/v1/conexiones` tal y como lo consume el
// frontend: los identificadores viajan como TEXTO (`connection_id`,
// `organization_id`) y las marcas de tiempo como ISO (`created_at`).

export type ConexionEstado = 'pendiente' | 'conectada' | 'revocada';

/** Fila de `public.conexiones` (nombres de columna del diagrama). */
export interface Conexion {
  conexion_id: number;
  empresa_id: number;
  cuenta_publicitaria_id: string;
  nombre_cuenta: string;
  estado: ConexionEstado;
  /** Alcances otorgados por Meta (guardados al conectar). */
  permisos: Record<string, unknown> | null;
  access_token_enc: string | null;
  token_expira_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

/** Vista del recurso `/v1/conexiones` (contrato del frontend). */
export interface ConexionView {
  connection_id: string;
  organization_id: string | null;
  cuenta_publicitaria_id: string;
  nombre_cuenta: string;
  estado: ConexionEstado;
  permisos: Record<string, unknown> | null;
  autenticada: boolean;
  created_at: string;
}
