// services/miembros.service.ts
// Gestión de MIEMBROS de la empresa (usuarios + su rol en `roles_usuarios`).
//
// Sobre el CRUD genérico de `/api/v1/usuarios` y `/api/v1/roles-usuarios`
// añade dos garantías que el núcleo no puede dar solo:
//
//   1. Invitar a un miembro (`invitarMiembro`): crea la cuenta en Supabase
//      Auth con una contraseña temporal, la fila local en `usuarios` dentro de
//      la empresa activa y su rol, y lo registra en la bitácora como INVITE.
//      Como todavía no hay servicio de correo, la contraseña temporal se
//      devuelve en la respuesta para que el administrador la comparta.
//   2. La empresa nunca se queda sin propietario (`asegurarPropietarioRestante`):
//      ni borrando un usuario ni quitándole su rol propietario se puede
//      bloquear el acceso al tenant.

import { randomBytes } from 'crypto';
import supabase from '../config/supabaseClient';
import { HttpError, ValidationError } from '../core/errors';
import { ORG_ROLES, OrgRole } from '../middlewares/requireRole';
import { logAudit } from './audit.service';

/** Días de vigencia de la contraseña temporal entregada al invitar. */
const VIGENCIA_CONTRASENIA_DIAS = 7;

export interface InvitarMiembroInput {
  nombre: string;
  email: string;
  telefono?: string | null;
  /** Nombre del rol del catálogo §13 (propietario | administrador | marketing | agente | lector). */
  rol: string;
}

export interface InvitacionResultado {
  usuario_id: number;
  auth_user_id: string;
  empresa_id: number;
  rol: OrgRole;
  /** Contraseña temporal generada (única vez; se devuelve al invitante). */
  contrasenia_temporal: string;
  contrasenia_temporal_hasta: string;
}

/** Contexto del autor de la acción (sesión resuelta por `orgContext`). */
export interface ContextoMiembros {
  authUserId?: string;
  usuarioId?: number;
  empresaId: string | number;
}

/** Contraseña temporal: aleatoria, sin caracteres ambiguos, 12 caracteres. */
function contraseniaTemporal(): string {
  return randomBytes(9).toString('base64url');
}

/** Valida que el rol exista en el catálogo §13 y lo devuelve tipado. */
export function rolValido(rol: string): OrgRole {
  if (!ORG_ROLES.includes(rol as OrgRole)) {
    throw new ValidationError(`El rol "${rol}" no existe en el catálogo`, [
      { field: 'rol', message: `Roles válidos: ${ORG_ROLES.join(', ')}` },
    ]);
  }
  return rol as OrgRole;
}

/**
 * Solo un propietario puede conceder o revocar el rol `propietario`; si no, un
 * administrador con `gestionar_usuarios` podría ascenderse (o ascender a un
 * cómplice) a superusuario de la empresa.
 */
export function exigirPropietarioParaRol(rolesDelActor: string[] | undefined, rolObjetivo: string): void {
  if (rolObjetivo === 'propietario' && !(rolesDelActor ?? []).includes('propietario')) {
    throw new HttpError(403, 'Solo un propietario puede asignar o revocar el rol propietario');
  }
}

/**
 * Crea un miembro nuevo en la empresa activa:
 * Supabase Auth (credencial) + `usuarios` (fila local) + `roles_usuarios` (rol).
 */
export async function invitarMiembro(
  input: InvitarMiembroInput,
  contexto: ContextoMiembros
): Promise<InvitacionResultado> {
  const rol = rolValido(input.rol);
  const empresaId = Number(contexto.empresaId);
  const email = input.email.trim().toLowerCase();

  // 1) El correo no puede estar ya registrado en la plataforma.
  const { data: existente } = await supabase
    .from('usuarios')
    .select('usuario_id')
    .eq('email', email)
    .maybeSingle();

  if (existente) {
    throw new HttpError(409, `El correo ${email} ya tiene una cuenta en la plataforma`);
  }

  // 2) Credencial en Supabase Auth (confirmada: la contraseña temporal se
  //    entrega por otro canal y el usuario la cambia al ingresar).
  const password = contraseniaTemporal();
  const { data: auth, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: input.nombre },
  });

  if (authError) {
    if (/already (registered|exists)/i.test(authError.message)) {
      throw new HttpError(409, `El correo ${email} ya tiene una cuenta en Supabase Auth`);
    }
    throw new HttpError(400, `No se pudo crear la credencial: ${authError.message}`);
  }

  const authUserId = auth.user!.id;
  const hasta = new Date(Date.now() + VIGENCIA_CONTRASENIA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  // 3) Fila local en `usuarios`, dentro de la empresa del invitante.
  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .insert([
      {
        nombre: input.nombre.trim(),
        email,
        telefono: input.telefono ?? null,
        empresa_id: empresaId,
        contrasenia_temporal_hasta: hasta,
        estado: 'activo',
      },
    ])
    .select()
    .single();

  if (usuarioError) {
    // Se revierte la credencial para no dejar cuentas huérfanas en Auth.
    await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw new HttpError(500, `No se pudo crear el usuario: ${usuarioError.message}`);
  }

  const usuarioId = (usuario as { usuario_id: number }).usuario_id;

  // 4) Rol (catálogo sembrado; si faltara, se crea al vuelo como en el registro).
  const { data: rolFila } = await supabase
    .from('roles')
    .select('rol_id')
    .eq('nombre', rol)
    .maybeSingle();

  let rolId = (rolFila as { rol_id: number } | null)?.rol_id ?? null;

  if (!rolId) {
    const { data: rolNuevo, error: rolError } = await supabase
      .from('roles')
      .insert([{ nombre: rol, estado: 'activo' }])
      .select()
      .single();

    if (rolError) throw new HttpError(500, `No se pudo crear el rol: ${rolError.message}`);
    rolId = (rolNuevo as { rol_id: number }).rol_id;
  }

  const { error: asignacionError } = await supabase.from('roles_usuarios').insert([
    { usuario_id: usuarioId, rol_id: rolId, estado: 'activo' },
  ]);

  if (asignacionError) {
    throw new HttpError(500, `No se pudo asignar el rol: ${asignacionError.message}`);
  }

  // Bitácora: alta de miembro (la contraseña jamás se registra, solo su marca).
  await logAudit(
    'usuarios',
    'INVITE',
    usuarioId,
    { email, rol, empresa_id: empresaId, contrasenia_temporal: true },
    { authUserId: contexto.authUserId, usuarioId: contexto.usuarioId, empresaId }
  );

  return {
    usuario_id: usuarioId,
    auth_user_id: authUserId,
    empresa_id: empresaId,
    rol,
    contrasenia_temporal: password,
    contrasenia_temporal_hasta: hasta,
  };
}

/**
 * Impide que la empresa quede sin propietario activo: comprueba que, tras
 * retirar la asignación indicada, siga existiendo al menos un propietario.
 *
 * Lanza HttpError(400) si la operación dejaría el tenant sin administración.
 */
export async function asegurarPropietarioRestante(
  empresaId: string | number | null | undefined,
  excluir: { usuarioId?: number | null; asignacionId?: number | null } = {}
): Promise<void> {
  if (empresaId == null) return;

  const { data, error } = await supabase
    .from('roles_usuarios')
    .select(
      'usuario_rol_id, usuario_id, estado, roles!inner(nombre, estado), usuarios!inner(empresa_id, estado)'
    )
    .eq('estado', 'activo')
    .eq('roles.nombre', 'propietario')
    .eq('usuarios.empresa_id', String(empresaId));

  if (error) throw new HttpError(500, `No se pudo verificar el rol propietario: ${error.message}`);

  const restantes = (data ?? []).filter((fila) => {
    const rol = fila.roles as unknown as { estado?: string } | null;
    const usuario = fila.usuarios as unknown as { estado?: string } | null;
    if (rol?.estado === 'inactivo' || usuario?.estado === 'inactivo') return false;
    if (excluir.usuarioId && Number(fila.usuario_id) === Number(excluir.usuarioId)) return false;
    if (excluir.asignacionId && Number(fila.usuario_rol_id) === Number(excluir.asignacionId)) return false;
    return true;
  });

  if (restantes.length === 0) {
    throw new HttpError(
      400,
      'La empresa debe conservar al menos un propietario activo: asigna ese rol a otra persona antes de continuar.'
    );
  }
}

export const miembrosService = { invitarMiembro, asegurarPropietarioRestante, rolValido };
