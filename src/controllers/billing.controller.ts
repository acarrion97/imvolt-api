// Controllers de créditos: consulta de wallet, recargas de prueba y ledger.
//
// La recarga es un stub explícito de pasarela: cualquier miembro activo puede
// solicitarla; los movimientos del ledger son siempre de solo lectura.

import { Request, RequestHandler, Response, Router } from 'express';
import { createCrudRouter, errorResponse } from '../core';
import { requireOrg } from '../middlewares/sessionAuth';
import { rechargeRequest } from '../requests/creative.request';
import { CreditTransactionView, CreditWallet } from '../models/commerce/credits.model';
import { BaseResource } from '../core/base.resource';
import { creditsService } from '../services/credits.service';

const walletResource = new BaseResource<any, CreditWallet>((row) => ({
  wallet_id: String(row.wallet_id),
  organization_id: String(row.organization_id),
  saldo: Number(row.saldo),
  moneda: row.moneda,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
}));

const transactionResource = new BaseResource<any, CreditTransactionView>((row) => ({
  transaction_id: String(row.transaction_id),
  wallet_id: String(row.wallet_id),
  organization_id: String(row.organization_id),
  tipo: row.tipo,
  monto: Number(row.monto),
  generation_id: row.generation_id == null ? null : String(row.generation_id),
  descripcion: row.descripcion ?? null,
  idempotency_key: row.idempotency_key ?? null,
  created_at: new Date(row.created_at).toISOString(),
}));

const filterByOrganization: RequestHandler = (req, _res, next) => {
  if (req.organizationId) {
    (req.query as Record<string, unknown>).organization_id = req.organizationId;
  }
  next();
};

const transactionsRouter = createCrudRouter({
  table: 'credit_transactions',
  primaryKey: 'transaction_id',
  request: undefined,
  resource: transactionResource,
  entityName: 'Movimiento de créditos',
  middlewares: [...requireOrg, filterByOrganization],
  disabled: ['create', 'update', 'remove'],
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
  tenantScoped: true,
  tenantColumn: 'organization_id',
});

const getWallet: RequestHandler = async (req, res) => {
  try {
    const wallet = await creditsService.getWallet(req.organizationId as string);
    res.json(walletResource.format(wallet));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

const recharge: RequestHandler = async (req: Request, res: Response) => {
  try {
    const payload = rechargeRequest.validateCreate(req.body);
    const result = await creditsService.recharge(
      req.organizationId as string,
      payload.monto,
      payload.idempotency_key ?? undefined,
    );
    res.status(201).json(walletResource.format(result.wallet));
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
};

export const billingRouter = Router();
billingRouter.get('/wallet', ...requireOrg, getWallet);
billingRouter.post('/recharge', ...requireOrg, recharge);
billingRouter.use('/transactions', transactionsRouter.router);
