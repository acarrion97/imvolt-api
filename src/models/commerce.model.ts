// models/commerce.model.ts
// IMVOLT commerce: planes, suscripciones, wallet de créditos y ledger.
// Documento maestro §16 y §13 (integridad de créditos).

export type NombrePlan = 'agent' | 'business' | 'developer';

export interface SubscriptionPlan {
  plan_id: string;
  nombre: NombrePlan;
  precio_mensual: number;
  propiedades_max: number;
  usuarios_max: number;
  campanas_max: number;
  incluye_lotes_al_mando: boolean;
  analitica: 'basica' | 'intermedia' | 'avanzada';
  activo: boolean;
  created_at: string;
}

export type EstadoSuscripcion = 'activa' | 'pausada' | 'vencida' | 'cancelada';

export interface Suscripcion {
  subscription_id: string;
  organization_id: string;
  plan_id: string;
  estado: EstadoSuscripcion;
  fecha_inicio: string;
  fecha_fin: string | null;
  created_at: string;
}

export interface CreditWallet {
  wallet_id: string;
  organization_id: string;
  /** Saldo derivado del ledger: nunca se edita sin registrar un movimiento. */
  saldo: number;
  moneda: string;
  updated_at: string;
}

/**
 * Tipos de movimiento del ledger (§13):
 * reserva → consumo (o devolución) | recarga | ajuste.
 * Un mismo evento de proveedor no puede facturarse dos veces
 * (idempotency_key con índice único).
 */
export type TipoMovimiento = 'reserva' | 'consumo' | 'devolucion' | 'recarga' | 'ajuste';

export interface CreditTransaction {
  transaction_id: string;
  wallet_id: string;
  organization_id: string;
  tipo: TipoMovimiento;
  /** Positivo suma al saldo, negativo resta. */
  monto: number;
  generation_id: string | null;
  descripcion: string | null;
  idempotency_key: string | null;
  created_at: string;
}
