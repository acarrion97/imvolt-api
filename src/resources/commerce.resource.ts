// resources/commerce.resource.ts
// Vistas de comercio: planes, suscripciones, wallets y ledger.

import { BaseResource } from '../core/base.resource';

export const planResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  plan_id: row.plan_id,
  nombre: row.nombre,
  precio_mensual: row.precio_mensual,
  propiedades_max: row.propiedades_max,
  usuarios_max: row.usuarios_max,
  campanas_max: row.campanas_max,
  incluye_lotes_al_mando: row.incluye_lotes_al_mando ?? false,
  analitica: row.analitica,
  activo: row.activo ?? true,
  created_at: row.created_at,
}));

export const suscripcionResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  subscription_id: row.subscription_id,
  organization_id: row.organization_id,
  plan_id: row.plan_id,
  estado: row.estado,
  fecha_inicio: row.fecha_inicio,
  fecha_fin: row.fecha_fin ?? null,
  created_at: row.created_at,
}));

export const walletResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  wallet_id: row.wallet_id,
  organization_id: row.organization_id,
  saldo: row.saldo ?? 0,
  moneda: row.moneda ?? 'USD',
  updated_at: row.updated_at,
}));

export const transaccionResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  transaction_id: row.transaction_id,
  wallet_id: row.wallet_id,
  organization_id: row.organization_id,
  tipo: row.tipo,
  monto: row.monto,
  generation_id: row.generation_id ?? null,
  descripcion: row.descripcion ?? null,
  created_at: row.created_at,
}));
