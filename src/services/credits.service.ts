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
  const { data, error } = await supabase.rpc('get_or_create_credit_wallet', {
    p_organization_id: Number(organizationId),
  });
  if (error) throw new Error(`Error al consultar o crear la wallet: ${error.message}`);
  if (!data || typeof data !== 'object') {
    throw new Error('No fue posible recuperar la wallet de créditos.');
  }
  return data as CreditWallet;
}

async function applyMovement(
  organizationId: string,
  tipo: TipoMovimiento,
  monto: number,
  options: {
    creditos?: number;
    generationId?: string | null;
    descripcion?: string | null;
    idempotencyKey: string;
  },
): Promise<{ wallet: CreditWallet; transaction: CreditTransaction }> {
  await getWallet(organizationId);
  const { data, error } = await supabase.rpc('apply_credit_movement', {
    p_organization_id: Number(organizationId),
    p_tipo: tipo,
    p_monto: monto,
    p_creditos: options.creditos ?? Math.abs(monto),
    p_generation_id: options.generationId ? Number(options.generationId) : null,
    p_descripcion: options.descripcion ?? null,
    p_idempotency_key: options.idempotencyKey,
  });

  if (error) {
    if (error.message.includes('CREDIT_INSUFFICIENT')) {
      let details: { saldo?: number; requerido?: number } = {};
      try {
        details = JSON.parse(error.details ?? '{}') as typeof details;
      } catch {
        details = {};
      }
      throw new HttpError(402, 'Créditos insuficientes para esta operación', details);
    }
    if (error.message.includes('CREDIT_IDEMPOTENCY_CONFLICT') ||
        error.message.includes('CREDIT_RESERVATION_CONFLICT') ||
        error.message.includes('CREDIT_RESERVATION_ALREADY_SETTLED')) {
      throw new HttpError(409, 'El movimiento ya fue procesado con otros datos');
    }
    if (error.message.includes('CREDIT_RESERVATION_NOT_FOUND')) {
      throw new HttpError(409, 'No existe una reserva pendiente para esta generación');
    }
    if (error.message.includes('CREDIT_GENERATION_REQUIRED')) {
      throw new HttpError(409, 'La generación debe tener una reserva antes de confirmarse');
    }
    throw new Error(`No se pudo registrar el movimiento de créditos: ${error.message}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('El ledger no devolvió el resultado del movimiento.');
  }
  const result = data as { wallet?: CreditWallet; transaction?: CreditTransaction };
  if (!result.wallet || !result.transaction) {
    throw new Error('El ledger devolvió un resultado incompleto.');
  }
  return { wallet: result.wallet, transaction: result.transaction };
}

export const creditsService = {
  getWallet,

  async balance(organizationId: string): Promise<number> {
    return (await getWallet(organizationId)).saldo;
  },

  /** Reserva créditos antes de crear un job IA (flujo §09, pasos 2 y 5). */
  reserve(organizationId: string, amount: number, generationId: string, idempotencyKey?: string) {
    return applyMovement(organizationId, 'reserva', -Math.abs(amount), {
      creditos: Math.abs(amount),
      generationId,
      descripcion: `Reserva para generación ${generationId}`,
      idempotencyKey: idempotencyKey ?? `reserve:${generationId}`,
    });
  },

  /** Confirma la reserva sin descontar el saldo una segunda vez. */
  confirm(organizationId: string, amount: number, generationId: string) {
    return applyMovement(organizationId, 'consumo', 0, {
      creditos: Math.abs(amount),
      generationId,
      descripcion: `Consumo confirmado de generación ${generationId}`,
      idempotencyKey: `consume:${generationId}`,
    });
  },

  /** Devuelve créditos cuando un job falla o se cancela de forma elegible. */
  refund(organizationId: string, amount: number, generationId: string) {
    return applyMovement(organizationId, 'devolucion', Math.abs(amount), {
      creditos: Math.abs(amount),
      generationId,
      descripcion: `Devolución por generación ${generationId}`,
      idempotencyKey: `refund:${generationId}`,
    });
  },

  /** Recarga de créditos (stub de pasarela: en producción la confirma billing). */
  recharge(organizationId: string, amount: number, idempotencyKey: string) {
    if (!idempotencyKey.trim()) {
      throw new HttpError(400, 'La recarga requiere una clave de idempotencia');
    }
    return applyMovement(organizationId, 'recarga', Math.abs(amount), {
      creditos: Math.abs(amount),
      descripcion: `Recarga de ${amount} créditos`,
      idempotencyKey,
    });
  },

  /** Crea la wallet de una organización nueva con los créditos de bienvenida. */
  async bootstrap(organizationId: string): Promise<void> {
    await getWallet(organizationId);
    if (WELCOME_CREDITS > 0) {
      await applyMovement(organizationId, 'recarga', WELCOME_CREDITS, {
        creditos: WELCOME_CREDITS,
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
