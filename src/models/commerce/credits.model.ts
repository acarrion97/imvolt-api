// models/commerce.model.ts
// Tipos del módulo de comercio: wallet de créditos y ledger de movimientos.
//
// NOTA: las tablas `credit_wallets` y `credit_transactions` pertenecían al
// esquema anterior (documento maestro) y fueron retiradas de `schema.sql` al
// alinear la base con el diagrama relacional. El servicio de créditos debe
// reactivarse sobre un modelo nuevo antes de volver a usarse.

/** Tipo de movimiento del ledger de créditos. */
export type TipoMovimiento = 'reserva' | 'consumo' | 'devolucion' | 'recarga' | 'ajuste';

/** Wallet de créditos de una organización. */
export interface CreditWallet {
  wallet_id: string;
  organization_id: string;
  saldo: number;
  moneda: string;
  updated_at: string | null;
}

/** Movimiento inmutable del ledger; el saldo nunca cambia sin uno de estos. */
export interface CreditTransaction {
  transaction_id: string;
  wallet_id: string;
  tipo: TipoMovimiento;
  monto: number;
  idempotency_key: string;
  detalles: Record<string, unknown> | null;
  creado_en: string;
}
