// middlewares/tenantScope.ts
// Acota cada operación CRUD a la empresa activa del contexto.
//
// `orgContext` (sessionAuth) resuelve la empresa del usuario autenticado y la
// deja en `req.organizationId`. Estos middlewares la aplican a las tablas que
// tienen columna `empresa_id`:
//
//   - GET  /  → fuerza el filtro `empresa_id` en el listado.
//   - POST /  → inyecta `empresa_id` en el payload de creación (si el cliente
//               no lo envía) para impedir cruces entre empresas.
//
// Las tablas globales (roles, permisos, formatos, tipos, objetivos…) no los
// usan: son catálogos compartidos por todas las empresas.

import { NextFunction, Request, Response } from 'express';

/** Fuerza `empresa_id` como filtro en GET / (listados). */
export const filterByEmpresa = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId) {
    (req.query as Record<string, unknown>).empresa_id = req.organizationId;
  }
  next();
};

/** Inyecta `empresa_id` en el body de creación (no pisa un valor explícito). */
export const assignEmpresaOnCreate = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId && req.body && typeof req.body === 'object' && req.body.empresa_id === undefined) {
    req.body = { ...req.body, empresa_id: req.organizationId };
  }
  next();
};
