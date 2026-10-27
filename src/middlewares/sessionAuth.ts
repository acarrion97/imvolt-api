// middlewares/sessionAuth.ts
// Valida el token Bearer de Supabase Auth y resuelve el contexto de EMPRESA
// (multi-tenant) sobre el diagrama relacional.
//
//   Authorization: Bearer <access_token>
//   X-Empresa-Id: <empresa_id>   (opcional; solo puede confirmar la empresa
//                                 propia: cualquier otro valor responde 403)
//
// `sessionAuth` comprueba el token con Supabase Auth. `orgContext` traduce ese
// usuario a la fila local `usuarios` (por email) y resuelve:
//
//   req.organizationId → empresa_id activo (se usa como tenant en los CRUD)
//   req.orgRole        → nombre del primer rol asignado en roles_usuarios
//   req.orgRoles       → todos sus roles activos
//   req.permissions    → unión de permisos activos de esos roles (RBAC fino)
//
// Esto reemplaza a la tabla `membresias` del esquema anterior: el RBAC ahora
// vive en usuarios + roles_usuarios + roles (RF-01 / RF-09).

import { NextFunction, Request, Response } from 'express';
import supabase from '../config/supabaseClient';
import { ORG_ROLES } from './requireRole';

interface UsuarioRow {
  usuario_id: number;
  email: string;
  empresa_id: number | null;
  estado: string;
}

/** Asignación con el rol incrustado y sus permisos (via roles_permisos). */
interface RolConPermisos {
  nombre?: string;
  estado?: string;
  roles_permisos?: Array<{ permisos?: { nombre?: string; estado?: string } | null }>;
}

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
 * Resuelve la empresa activa y el rol del usuario dentro de ella.
 * Debe ejecutarse DESPUÉS de `sessionAuth`.
 *
 * Reglas (RF-01 / P0): un usuario ajeno no puede leer ni editar los registros
 * de otra empresa; el tenant se resuelve desde su fila en `usuarios`.
 */
export const orgContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Sesión no iniciada' });
      return;
    }

    const email = (req.user as { email?: string } | undefined)?.email;
    if (!email) {
      res.status(401).json({ message: 'El token no incluye un correo de acceso' });
      return;
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('usuario_id, email, empresa_id, estado')
      .eq('email', email)
      .maybeSingle();

    if (usuarioError) throw new Error(usuarioError.message);

    const local = usuario as UsuarioRow | null;
    if (!local || local.estado === 'inactivo') {
      res.status(403).json({ message: 'El usuario no tiene una cuenta activa en la plataforma' });
      return;
    }

    // RF-01 / P0: `usuarios.empresa_id` es único en el diagrama (no existe
    // membresía múltiple), así que el header solo puede CONFIRMAR la empresa
    // propia. Cualquier otro valor (o un usuario sin empresa) responde 403: sin
    // esta comprobación, `X-Empresa-Id` dejaría leer y escribir los registros
    // de otra compañía.
    if (local.empresa_id == null) {
      res.status(403).json({ message: 'El usuario no tiene una empresa asignada' });
      return;
    }

    const empresaSolicitada = (req.headers['x-empresa-id'] as string | undefined)?.trim();
    if (empresaSolicitada && Number(empresaSolicitada) !== Number(local.empresa_id)) {
      res.status(403).json({ message: 'El usuario no pertenece a la empresa indicada en X-Empresa-Id' });
      return;
    }

    const empresaId = String(local.empresa_id);

    // Roles activos del usuario con sus permisos (RBAC fino): el runtime usa
    // el nombre del rol (requireRole) y la unión de permisos (requirePermission).
    const { data: asignaciones, error: rolesError } = await supabase
      .from('roles_usuarios')
      .select(
        "rol_id, estado, roles(nombre, estado, roles_permisos(permisos(nombre, estado)))"
      )
      .eq('usuario_id', local.usuario_id)
      .eq('estado', 'activo');

    if (rolesError) throw new Error(rolesError.message);

    const rolesActivos = (asignaciones ?? [])
      .map((asignacion) => asignacion.roles as unknown as RolConPermisos | null)
      .filter((rol): rol is RolConPermisos => Boolean(rol?.nombre) && rol?.estado !== 'inactivo');

    const rolesReconocidos = rolesActivos.filter((rol) =>
      ORG_ROLES.includes(rol.nombre as (typeof ORG_ROLES)[number])
    );
    if (rolesReconocidos.length === 0) {
      res.status(403).json({ message: 'El usuario no tiene un rol activo autorizado' });
      return;
    }

    const rol = rolesReconocidos[0]?.nombre;

    const permisos = new Set<string>();
    for (const rolActivo of rolesReconocidos) {
      for (const vinculo of rolActivo.roles_permisos ?? []) {
        const permiso = (vinculo as { permisos?: { nombre?: string; estado?: string } | null }).permisos;
        if (permiso?.nombre && permiso.estado !== 'inactivo') permisos.add(permiso.nombre);
      }
    }

    req.organizationId = empresaId;
    req.orgRole = rol;
    req.orgRoles = rolesReconocidos
      .map((rolActivo) => rolActivo.nombre)
      .filter((nombre): nombre is string => Boolean(nombre));
    req.permissions = [...permisos];
    // Fila local en `usuarios`: la usa la bitácora de auditoría para saber
    // qué usuario de la plataforma realizó la acción.
    req.localUsuarioId = local.usuario_id;
    next();
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Error de contexto de empresa' });
  }
};

/**
 * Middlewares combinados usados por los routers CRUD: sesión + empresa.
 */
export const requireOrg = [sessionAuth, orgContext];
