// middlewares/planLimits.ts
// Aplica las restricciones de uso del plan (services/plan-limits.service.ts)
// en las altas de recursos.
//
// Los `writeMiddlewares` del CRUD genérico se ejecutan también en update y
// remove, que NO consumen cuota: en esas operaciones el middleware se salta.
// Lo mismo evita tocar los `POST /:id/...` (validar, aprobar, publicar…), que
// modifican un registro ya existente en lugar de crear uno nuevo.

import { NextFunction, Request, RequestHandler, Response } from 'express';
import { errorResponse } from '../core/errors';
import { exigirLimiteDePlan, LimiteRecurso } from '../services/plan-limits.service';

/** Responde 403 si el plan de la empresa ya alcanzó su máximo para `recurso`. */
export const limitarPorPlan =
  (recurso: LimiteRecurso): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Solo las altas consumen cuota (POST sobre la colección, sin :id).
      if (req.method !== 'POST' || req.params.id) {
        next();
        return;
      }

      if (!req.organizationId) {
        res.status(401).json({ message: 'Sesión no iniciada' });
        return;
      }

      await exigirLimiteDePlan(req.organizationId, recurso);
      next();
    } catch (error) {
      const { status, body } = errorResponse(error);
      res.status(status).json(body);
    }
  };
