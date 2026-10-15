// controllers/commerce.controller.ts
// IMVOLT commerce: planes, suscripciones y créditos (wallet + ledger).
// Documento maestro §16 (modelo SaaS) y RF-06 (créditos sin doble cargo).

import { Request, Response, Router } from 'express';
import { createCrudRouter } from '../core/crud.factory';
import { planRequest, suscripcionRequest, recargaRequest } from '../requests/commerce.request';
import { planResource, suscripcionResource, walletResource, transaccionResource } from '../resources/commerce.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByOrg, assignOrgOnCreate } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin } from '../middlewares/requireRole';
import { creditsService } from '../services/credits.service';

const sendError = (res: Response, error: unknown): void => {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const httpError = error as { statusCode: number; message: string; details?: unknown };
    res.status(httpError.statusCode).json({ message: httpError.message, details: httpError.details });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : 'Error interno del servidor' });
};

// ── Planes (catálogo comercial) ─────────────────────────────────────────────
export const { router: planRouter } = createCrudRouter({
  table: 'subscription_plans',
  primaryKey: 'plan_id',
  request: planRequest,
  resource: planResource,
  entityName: 'Plan',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin],
  defaultGetAllOptions: { orderBy: 'precio_mensual', ascending: true },
});

// ── Suscripciones por organización ──────────────────────────────────────────
export const { router: suscripcionRouter } = createCrudRouter({
  table: 'suscripciones',
  primaryKey: 'subscription_id',
  request: suscripcionRequest,
  resource: suscripcionResource,
  entityName: 'Suscripción',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Créditos: wallet + ledger ───────────────────────────────────────────────
export const billingRouter = Router();

/** GET /billing/wallet — saldo vigente de la organización. */
billingRouter.get('/wallet', ...requireOrg, async (req: Request, res: Response) => {
  try {
    res.json(walletResource.format(await creditsService.getWallet(req.organizationId!)));
  } catch (error) {
    sendError(res, error);
  }
});

/** GET /billing/transactions — historial del ledger (§14). */
billingRouter.get('/transactions', ...requireOrg, async (req: Request, res: Response) => {
  try {
    const limite = Number(req.query.limite) || 100;
    const transactions = await creditsService.listTransactions(req.organizationId!, limite);
    res.json(transaccionResource.formatMany(transactions));
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /billing/recharge — recarga de créditos.
 * Stub de pasarela: en producción la confirma el proveedor de cobro y este
 * endpoint solo registra el movimiento validado.
 */
billingRouter.post('/recharge', ...requireOrg, writeByOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const payload = recargaRequest.validateCreate(req.body) as { monto: number; idempotency_key?: string };
    const result = await creditsService.recharge(req.organizationId!, payload.monto, payload.idempotency_key);

    res.status(201).json({
      wallet: walletResource.format(result.wallet),
      transaction: transaccionResource.format(result.transaction),
    });
  } catch (error) {
    sendError(res, error);
  }
});
