// middlewares/sessionAuth.ts
// Valida el token Bearer de Supabase Auth y resuelve el contexto de EMPRESA
// (multi-tenant) sobre el diagrama relacional.
//
//   Authorization: Bearer <access_token>
//   X-Empresa-Id: <empresa_id>   (opcional; si falta se usa la del usuario)
//
// `sessionAuth` comprueba el token con Supabase Auth. `orgContext` traduce ese
// usuario a la fila local `usuarios` (por email) y resuelve:
//
//   req.organizationId → empresa_id activo (se usa como tenant en los CRUD)
//   req.orgRole        → nombre del primer rol asignado en roles_usuarios
//
// Esto reemplaza a la tabla `membresias` del esquema anterior: el RBAC ahora
// vive en usuarios + roles_usuarios + roles (RF-01 / RF-09).

import { NextFunction, Request, Response } from 'express';
import supabase from '../config/supabaseClient';

interface UsuarioRow {
  usuario_id: number;
  email: string;
  empresa_id: number | null;
  estado: string;
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

    const empresaSolicitada = (req.headers['x-empresa-id'] as string | undefined)?.trim();
    const empresaId = empresaSolicitada || (local.empresa_id != null ? String(local.empresa_id) : '');

    if (!empresaId) {
      res.status(403).json({ message: 'El usuario no tiene una empresa asignada' });
      return;
    }

    const { data: asignaciones, error: rolesError } = await supabase
      .from('roles_usuarios')
      .select('rol_id, estado, roles(nombre, estado)')
      .eq('usuario_id', local.usuario_id)
      .eq('estado', 'activo');

    if (rolesError) throw new Error(rolesError.message);

    const rol = (asignaciones ?? [])
      .map((asignacion) => (asignacion.roles as unknown as { nombre?: string; estado?: string } | null)?.nombre)
      .find((nombre): nombre is string => Boolean(nombre));

    req.organizationId = empresaId;
    req.orgRole = rol;
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
