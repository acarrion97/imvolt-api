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

import { NextFunction, Request, RequestHandler, Response } from 'express';
import supabase from '../config/supabaseClient';
import { errorResponse } from '../core/errors';

/** Fuerza `empresa_id` como filtro en GET / (listados). */
export const filterByEmpresa = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId) {
    (req.query as Record<string, unknown>).empresa_id = req.organizationId;
  }
  next();
};

/**
 * `empresa_id` SIEMPRE es el de la sesión, al crear y al editar. A diferencia
 * de `assignEmpresaOnCreate` (que respeta un valor explícito), no permite
 * crear ni mover registros hacia otra empresa enviando `empresa_id` en el body.
 */
export const forceEmpresa = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId && req.body && typeof req.body === 'object') {
    req.body = { ...req.body, empresa_id: req.organizationId };
  }
  next();
};

/**
 * Verifica que la FK `field` del body apunte a un registro de la empresa
 * activa (p. ej. `propiedad_id` de un contacto). Evita enlazar datos propios a
 * registros ajenos. Si el campo no viene (PATCH parcial) o es null, no hace nada.
 */
export const requireOwnedRef =
  (field: string, table: string, pk: string, tenantColumn = 'empresa_id'): RequestHandler =>
  async (req, res, next) => {
    try {
      const value = req.body?.[field];
      if (value === undefined || value === null || !req.organizationId) {
        next();
        return;
      }
      const { data, error } = await supabase
        .from(table)
        .select(tenantColumn)
        .eq(pk, value)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const owner = (data as Record<string, unknown> | null)?.[tenantColumn];
      if (owner == null || String(owner) !== req.organizationId) {
        res.status(400).json({
          message: 'Datos de entrada inválidos',
          details: [{ field, message: 'La referencia no existe o no pertenece a tu empresa' }],
        });
        return;
      }
      next();
    } catch (error) {
      const { status, body } = errorResponse(error);
      res.status(status).json(body);
    }
  };

/** Inyecta `empresa_id` en el body de creación (no pisa un valor explícito). */
export const assignEmpresaOnCreate = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.organizationId && req.body && typeof req.body === 'object' && req.body.empresa_id === undefined) {
    req.body = { ...req.body, empresa_id: req.organizationId };
  }
  next();
};
