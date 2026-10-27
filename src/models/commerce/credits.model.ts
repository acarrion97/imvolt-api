/** Wallet de créditos de una organización. */
export interface CreditWallet {
  wallet_id: string;
  organization_id: number | string;
  saldo: number;
  moneda: string;
  created_at: string;
  updated_at: string;
}

export type TipoMovimiento = 'reserva' | 'consumo' | 'devolucion' | 'recarga' | 'ajuste';

/** Movimiento inmutable del ledger de créditos. */
export interface CreditTransaction {
  transaction_id: number;
  wallet_id: string;
  organization_id: number | string;
  tipo: TipoMovimiento;
  monto: number;
  generation_id: number | null;
  descripcion: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface CreditTransactionView extends Omit<CreditTransaction, 'transaction_id' | 'generation_id' | 'organization_id'> {
  transaction_id: string;
  generation_id: string | null;
  organization_id: string;
}

export const creditWalletsModel = {
  table: 'credit_wallets',
  fields: ['wallet_id', 'organization_id', 'saldo', 'moneda', 'created_at', 'updated_at'],
  primary: 'wallet_id',
};

export const creditTransactionsModel = {
  table: 'credit_transactions',
  fields: ['transaction_id', 'wallet_id', 'organization_id', 'tipo', 'monto', 'generation_id', 'descripcion', 'idempotency_key', 'created_at'],
  primary: 'transaction_id',
};
