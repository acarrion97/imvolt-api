// middlewares/requireRole.ts
// RBAC por organización (documento maestro, §15: RBAC + auditoría).
//
//   router.post('/', ...requireOrg, requireRole('propietario', 'administrador'), handler)
//
// Roles válidos: propietario | administrador | marketing | agente | lector.

import { NextFunction, Request, Response } from 'express';

export const ORG_ROLES = ['propietario', 'administrador', 'marketing', 'agente', 'lector'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Permite la escritura a propietario y administrador (y opcionalmente marketing). */
export const requireRole =
  (...allowed: OrgRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const role = req.orgRole as OrgRole | undefined;

    if (!role || !ORG_ROLES.includes(role)) {
      res.status(403).json({ message: 'Rol de organización no reconocido' });
      return;
    }

    if (!allowed.includes(role)) {
      res.status(403).json({
        message: `Tu rol "${role}" no tiene permiso para esta acción. Requiere: ${allowed.join(' o ')}.`,
      });
      return;
    }

    next();
  };

/** Solo lectura (cualquier rol autenticado con membresía activa). */
export const readOnly = requireRole(...ORG_ROLES);

/** Escritura básica: propietario y administrador. */
export const writeByOwnerOrAdmin = requireRole('propietario', 'administrador');

/** Gestión de campañas, estudio y leads: agrega marketing. */
export const writeByMarketing = requireRole('propietario', 'administrador', 'marketing');
