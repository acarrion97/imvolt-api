// middlewares/sessionAuth.ts
// Valida el token Bearer de Supabase Auth y resuelve el contexto de
// organización (multi-tenant) del documento maestro, §15.
//
//   Authorization: Bearer <access_token>
//   X-Org-Id: <organization_id>   (opcional; si falta se usa la primera membresía)

import { NextFunction, Request, Response } from 'express';
import supabase from '../config/supabaseClient';
import { config } from '../config/global';

/** Devuelve 401 si no hay token válido. */
export const sessionAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({ message: 'Token de autenticación no proporcionado' });
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ message: 'Token de autenticación inválido o expirado' });
      return;
    }

    req.userId = data.user.id;
    req.user = data.user as unknown as Record<string, unknown>;
    next();
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Error de autenticación' });
  }
};

/**
 * Resuelve la organización activa y el rol del usuario dentro de ella.
 * Debe ejecutarse DESPUÉS de `sessionAuth`.
 *
 * Reglas (RF-01 / P0): un usuario ajeno no puede leer ni editar otra
 * organización; toda consulta queda acotada a `req.organizationId`.
 */
export const orgContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Sesión no iniciada' });
      return;
    }

    const requestedOrg = (req.headers['x-org-id'] as string | undefined)?.trim();
    const organizationId = requestedOrg || config.defaultOrganizationId;

    const query = supabase
      .from('membresias')
      .select('organization_id, rol, activo')
      .eq('user_id', req.userId);

    const { data: memberships, error } = organizationId
      ? await query.eq('organization_id', organizationId)
      : await query;

    if (error) throw new Error(error.message);

    const active = (memberships ?? []).filter((m) => m.activo !== false);
    if (active.length === 0) {
      res.status(403).json({ message: 'El usuario no pertenece a ninguna organización activa' });
      return;
    }

    const membership = active.find((m) => m.organization_id === organizationId) ?? active[0];
    req.organizationId = membership.organization_id;
    req.orgRole = membership.rol;
    next();
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Error de contexto de organización' });
  }
};

/**
 * Middlewares combinados usados por los routers CRUD: sesión + organización.
 */
export const requireOrg = [sessionAuth, orgContext];
