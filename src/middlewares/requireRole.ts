// middlewares/requireRole.ts
// RBAC por organización (documento maestro, §15: RBAC + auditoría).
//
//   router.post('/', ...requireOrg, requireRole('propietario', 'administrador'), handler)
//
// Roles válidos: propietario | administrador | marketing | agente | lector.
// El usuario conserva TODOS sus roles activos (`req.orgRoles`), de modo que
// basta con poseer uno de los permitidos; `req.orgRole` sigue siendo el primero
// por compatibilidad con las respuestas existentes.

import { NextFunction, Request, Response } from 'express';

export const ORG_ROLES = ['propietario', 'administrador', 'marketing', 'agente', 'lector'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Permisos sembrados en `permisos` (catálogo del RBAC fino). */
export const ORG_PERMISSIONS = [
  'gestionar_usuarios',
  'gestionar_propiedades',
  'crear_contenidos',
  'gestionar_campanas',
  'ver_analitica',
  'gestionar_integraciones',
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

/** Roles o permisos activos del usuario en la sesión (resueltos por `orgContext`). */
const rolesDe = (req: Request): string[] => {
  const roles = req.orgRoles ?? (req.orgRole ? [req.orgRole] : []);
  return roles.filter((rol): rol is OrgRole => ORG_ROLES.includes(rol as OrgRole));
};

/** Permite la escritura a propietario y administrador (y opcionalmente marketing). */
export const requireRole =
  (...allowed: OrgRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const roles = rolesDe(req);

    if (!roles.length) {
      res.status(403).json({ message: 'Rol de organización no reconocido' });
      return;
    }

    if (!roles.some((rol) => allowed.includes(rol as OrgRole))) {
      res.status(403).json({
        message: `Tu rol "${req.orgRole ?? roles[0]}" no tiene permiso para esta acción. Requiere: ${allowed.join(' o ')}.`,
      });
      return;
    }

    next();
  };

/**
 * RBAC fino por permiso (`roles_permisos`), resuelto en `orgContext`.
 *
 * El rol `propietario` es superusuario: hereda todos los permisos aunque la
 * tabla `roles_permisos` esté vacía o desactualizada, para que la empresa nunca
 * quede sin administración.
 */
export const requirePermission =
  (...allowed: OrgPermission[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (rolesDe(req).includes('propietario')) {
      next();
      return;
    }

    const permisos = req.permissions ?? [];
    const coincide = allowed.some((permiso) => permisos.includes(permiso));

    if (!coincide) {
      res.status(403).json({
        message: `Tu rol no tiene el permiso "${allowed.join('" ni "')}" para esta acción.`,
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

/** Gestión del equipo: requiere el permiso `gestionar_usuarios`. */
export const manageUsers = requirePermission('gestionar_usuarios');
