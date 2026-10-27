// services/credits.service.ts
// Wallet de créditos + ledger (documento maestro, §16 y §13 "Integridad de créditos").
//
// El saldo NUNCA se muta sin dejar un movimiento en `credit_transactions`:
//   reserva → consumo (o devolución) | recarga | ajuste
// Todas las operaciones son idempotentes vía `idempotency_key`: un mismo
// evento de proveedor no puede facturarse dos veces.

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { CreditTransaction, CreditWallet, TipoMovimiento } from '../models/commerce/credits.model';

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
    .insert([{ organization_id: organizationId, saldo: WELCOME_CREDITS, moneda: 'USD' }])
    .select()
    .maybeSingle();

  if (createError) {
    // Dos peticiones simultáneas pueden intentar inicializar la misma empresa.
    if (createError.code !== '23505') throw new Error(`Error al crear la wallet: ${createError.message}`);
    const { data: raced, error: racedError } = await supabase
      .from('credit_wallets')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (racedError) throw new Error(`Error al recuperar la wallet: ${racedError.message}`);
    if (!raced) throw new Error('No fue posible recuperar la wallet creada en paralelo');
    return raced as CreditWallet;
  }
  if (!created) throw new Error('No fue posible crear la wallet de créditos');

  if (WELCOME_CREDITS > 0) {
    const { error: welcomeError } = await supabase.from('credit_transactions').insert([{
      wallet_id: created.wallet_id,
      organization_id: organizationId,
      tipo: 'recarga',
      monto: WELCOME_CREDITS,
      descripcion: 'Créditos de bienvenida IMVOLT',
      idempotency_key: `welcome:${organizationId}`,
    }]);
    if (welcomeError) {
      const { data: welcome, error: lookupError } = await supabase
        .from('credit_transactions')
        .select('transaction_id')
        .eq('idempotency_key', `welcome:${organizationId}`)
        .maybeSingle();
      if (lookupError) throw new Error(`Error al verificar créditos de bienvenida: ${lookupError.message}`);
      if (!welcome) throw new Error(`Error al registrar créditos de bienvenida: ${welcomeError.message}`);
    }
  }
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

  // Actualización optimista: solo aplica si el saldo no cambió entre lectura
  // y escritura; ante colisión se reintenta una vez.
  let currentWallet = wallet;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const nuevoSaldo = currentWallet.saldo + monto;
    if (nuevoSaldo < 0) {
      throw new HttpError(402, 'Créditos insuficientes para esta operación', {
        saldo: currentWallet.saldo,
        requerido: Math.abs(monto),
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('credit_wallets')
      .update({ saldo: nuevoSaldo, updated_at: new Date().toISOString() })
      .eq('wallet_id', currentWallet.wallet_id)
      .eq('saldo', currentWallet.saldo)
      .select()
      .maybeSingle();

    if (updateError) throw new Error(`Error al actualizar la wallet: ${updateError.message}`);
    if (!updated) {
      currentWallet = await getWallet(organizationId);
      continue;
    }

    const { data: transaction, error: txError } = await supabase
      .from('credit_transactions')
      .insert([
        {
          wallet_id: currentWallet.wallet_id,
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

    if (txError) {
      const { error: rollbackError } = await supabase
        .from('credit_wallets')
        .update({ saldo: currentWallet.saldo, updated_at: new Date().toISOString() })
        .eq('wallet_id', currentWallet.wallet_id)
        .eq('saldo', nuevoSaldo);
      if (rollbackError) {
        throw new Error(`No se pudo registrar el movimiento ni revertir el saldo: ${txError.message}; ${rollbackError.message}`);
      }
      throw new Error(`Error al registrar el movimiento: ${txError.message}`);
    }
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
