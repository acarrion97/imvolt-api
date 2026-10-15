// middlewares/tenantScope.ts
// Acota cada operación CRUD a la organización activa del contexto.
//
// Debe usarse DESPUÉS de `orgContext` en los routers CRUD:
//   - GET  /  → fuerza el filtro organization_id en el listado.
//   - POST /  → inyecta organization_id en el payload de creación.
//   - PUT/PATCH/DELETE /:id → el controller re-verifica pertenencia.
//
// Así se cumplen los invariantes de multi-tenant del documento maestro (§13):
// "restricciones, índices e invariantes de integridad para impedir cruces
// entre organizaciones".

import { NextFunction, Request, Response } from 'express';

/** Fuerza `organization_id` como filtro en GET / (listados). */
export const filterByOrg = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId) {
    (req.query as Record<string, unknown>).organization_id = req.organizationId;
  }
  next();
};

/** Inyecta `organization_id` en el body de creación. */
export const assignOrgOnCreate = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId && req.body && typeof req.body === 'object') {
    req.body = { ...req.body, organization_id: req.organizationId };
  }
  next();
};
