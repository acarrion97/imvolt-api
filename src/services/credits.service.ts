// services/credits.service.ts
// Wallet de créditos + ledger (documento maestro, §16 y §13 "Integridad de créditos").
//
// El saldo NUNCA se muta sin dejar un movimiento en `credit_transactions`:
//   reserva → consumo (o devolución) | recarga | ajuste
// Todas las operaciones son idempotentes vía `idempotency_key`: un mismo
// evento de proveedor no puede facturarse dos veces.

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { CreditTransaction, CreditWallet, TipoMovimiento } from '../models/commerce.model';

/** Créditos de bienvenida al registrar una organización (hipótesis a validar). */
const WELCOME_CREDITS = 25;

export async function getWallet(organizationId: string): Promise<CreditWallet> {
  const { data, error } = await supabase
    .from('credit_wallets')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new Error(`Error al consultar la wallet: ${error.message}`);
  if (data) return data as CreditWallet;

  const { data: created, error: createError } = await supabase
    .from('credit_wallets')
    .insert([{ organization_id: organizationId, saldo: 0, moneda: 'USD' }])
    .select()
    .single();

  if (createError) throw new Error(`Error al crear la wallet: ${createError.message}`);
  return created as CreditWallet;
}

async function applyMovement(
  organizationId: string,
  tipo: TipoMovimiento,
  monto: number,
  options: { generationId?: string | null; descripcion?: string | null; idempotencyKey?: string | null } = {},
): Promise<{ wallet: CreditWallet; transaction: CreditTransaction }> {
  const wallet = await getWallet(organizationId);

  // Idempotencia: si la clave ya existe, devuelve el movimiento registrado.
  if (options.idempotencyKey) {
    const { data: existing } = await supabase
      .from('credit_transactions')
      .select('*, credit_wallets(*)')
      .eq('idempotency_key', options.idempotencyKey)
      .maybeSingle();

    if (existing) {
      const { credit_wallets: latestWallet, ...transaction } = existing as CreditTransaction & {
        credit_wallets: CreditWallet;
      };
      return { wallet: latestWallet ?? wallet, transaction: transaction as CreditTransaction };
    }
  }

  const nuevoSaldo = wallet.saldo + monto;
  if (nuevoSaldo < 0) {
    throw new HttpError(402, 'Créditos insuficientes para esta operación', {
      saldo: wallet.saldo,
      requerido: Math.abs(monto),
    });
  }

  // Actualización optimista: solo aplica si el saldo no cambió entre lectura
  // y escritura; ante colisión se reintenta una vez.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: updated, error: updateError } = await supabase
      .from('credit_wallets')
      .update({ saldo: nuevoSaldo, updated_at: new Date().toISOString() })
      .eq('wallet_id', wallet.wallet_id)
      .eq('saldo', wallet.saldo)
      .select()
      .maybeSingle();

    if (updateError) throw new Error(`Error al actualizar la wallet: ${updateError.message}`);
    if (!updated) {
      wallet.saldo = (await getWallet(organizationId)).saldo;
      continue;
    }

    const { data: transaction, error: txError } = await supabase
      .from('credit_transactions')
      .insert([
        {
          wallet_id: wallet.wallet_id,
          organization_id: organizationId,
          tipo,
          monto,
          generation_id: options.generationId ?? null,
          descripcion: options.descripcion ?? null,
          idempotency_key: options.idempotencyKey ?? null,
        },
      ])
      .select()
      .single();

    if (txError) throw new Error(`Error al registrar el movimiento: ${txError.message}`);
    return { wallet: updated as CreditWallet, transaction: transaction as CreditTransaction };
  }

  throw new HttpError(409, 'No fue posible actualizar los créditos: intenta nuevamente');
}

export const creditsService = {
  getWallet,

  async balance(organizationId: string): Promise<number> {
    return (await getWallet(organizationId)).saldo;
  },

  /** Reserva créditos antes de crear un job IA (flujo §09, pasos 2 y 5). */
  reserve(organizationId: string, amount: number, generationId: string, idempotencyKey?: string) {
    return applyMovement(organizationId, 'reserva', -Math.abs(amount), {
      generationId,
      descripcion: `Reserva para generación ${generationId}`,
      idempotencyKey: idempotencyKey ?? `reserve:${generationId}`,
    });
  },

  /** Confirma el consumo real de créditos de una generación completada. */
  confirm(organizationId: string, amount: number, generationId: string) {
    return applyMovement(organizationId, 'consumo', -Math.abs(amount), {
      generationId,
      descripcion: `Consumo confirmado de generación ${generationId}`,
      idempotencyKey: `consume:${generationId}`,
    });
  },

  /** Devuelve créditos cuando un job falla o se cancela de forma elegible. */
  refund(organizationId: string, amount: number, generationId: string) {
    return applyMovement(organizationId, 'devolucion', Math.abs(amount), {
      generationId,
      descripcion: `Devolución por generación ${generationId}`,
      idempotencyKey: `refund:${generationId}`,
    });
  },

  /** Recarga de créditos (stub de pasarela: en producción la confirma billing). */
  recharge(organizationId: string, amount: number, idempotencyKey?: string) {
    return applyMovement(organizationId, 'recarga', Math.abs(amount), {
      descripcion: `Recarga de ${amount} créditos`,
      idempotencyKey: idempotencyKey ?? `recharge:${Date.now()}`,
    });
  },

  /** Crea la wallet de una organización nueva con los créditos de bienvenida. */
  async bootstrap(organizationId: string): Promise<void> {
    await getWallet(organizationId);
    if (WELCOME_CREDITS > 0) {
      await applyMovement(organizationId, 'recarga', WELCOME_CREDITS, {
        descripcion: 'Créditos de bienvenida IMVOLT',
        idempotencyKey: `welcome:${organizationId}`,
      });
    }
  },

  async listTransactions(organizationId: string, limit = 100): Promise<CreditTransaction[]> {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Error al consultar movimientos: ${error.message}`);
    return (data ?? []) as CreditTransaction[];
  },
};
