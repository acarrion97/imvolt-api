// services/auth.service.ts
// Registro, login y perfil del usuario IMVOLT sobre Supabase Auth + tablas del
// diagrama relacional.
//
// Registro multi-empresa: "una cuenta personal de agente se modela como una
// empresa pequeña, no como una excepción al esquema". Al registrarse se crea:
//   1. el usuario en Supabase Auth (credenciales),
//   2. la empresa (tenant) en `empresas`,
//   3. la fila local del usuario en `usuarios`,
//   4. la asignación del rol `propietario` en `roles_usuarios`.
//
// El acceso posterior resuelve empresa y rol en `middlewares/sessionAuth`.

import supabase, { supabaseAuthSession } from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { Usuario } from '../models/identity/usuario.model';
import { ORG_PERMISSIONS } from '../middlewares/requireRole';
import { logAudit } from './audit.service';

export interface RegisterInput {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
  telefono?: string;
  /** Razón social de la empresa creada junto a la cuenta. */
  organization_name: string;
  /** RUC (13 dígitos); puede quedar pendiente y completarse después. */
  ruc?: string;
}

export interface SessionResult {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

export interface RegisterResult {
  user_id: string;
  empresa_id: number | null;
  usuario_id: number | null;
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nombres: input.nombres, apellidos: input.apellidos },
  });

  if (error) {
    throw new HttpError(400, `No se pudo crear la cuenta: ${error.message}`);
  }

  const userId = data.user!.id;

  // 1) Empresa (tenant)
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .insert([
      {
        razon_social: input.organization_name,
        ruc: input.ruc ?? null,
        estado: 'activo',
      },
    ])
    .select()
    .single();

  if (empresaError) {
    throw new HttpError(500, `No se pudo crear la empresa: ${empresaError.message}`);
  }

  const empresaId = (empresa as { empresa_id: number }).empresa_id;

  // 2) Usuario local (vinculado por email con Supabase Auth)
  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .insert([
      {
        nombre: `${input.nombres} ${input.apellidos}`.trim(),
        email: input.email,
        telefono: input.telefono ?? null,
        empresa_id: empresaId,
        estado: 'activo',
      },
    ])
    .select()
    .single();

  if (usuarioError) {
    throw new HttpError(500, `No se pudo crear el usuario: ${usuarioError.message}`);
  }

  const usuarioId = (usuario as Usuario).usuario_id;

  // 3) Rol propietario (se crea en la semilla; si no existe, se crea aquí)
  const { data: rolExistente } = await supabase
    .from('roles')
    .select('rol_id')
    .eq('nombre', 'propietario')
    .maybeSingle();

  let rolId = (rolExistente as { rol_id: number } | null)?.rol_id ?? null;

  if (!rolId) {
    const { data: rolNuevo, error: rolError } = await supabase
      .from('roles')
      .insert([{ nombre: 'propietario', estado: 'activo' }])
      .select()
      .single();

    if (rolError) throw new HttpError(500, `No se pudo crear el rol: ${rolError.message}`);
    rolId = (rolNuevo as { rol_id: number }).rol_id;
  }

  const { error: asignacionError } = await supabase.from('roles_usuarios').insert([
    {
      usuario_id: usuarioId,
      rol_id: rolId,
      estado: 'activo',
    },
  ]);

  if (asignacionError) {
    throw new HttpError(500, `No se pudo asignar el rol: ${asignacionError.message}`);
  }

  // Bitácora: alta de cuenta (empresa + usuario + rol propietario).
  await logAudit('usuarios', 'REGISTER', usuarioId, {
    email: input.email,
    empresa_id: empresaId,
    organizacion: input.organization_name,
    rol: 'propietario',
  }, { authUserId: userId, usuarioId, empresaId });

  return { user_id: userId, empresa_id: empresaId, usuario_id: usuarioId };
}

export async function login(email: string, password: string): Promise<SessionResult> {
  // Cliente aislado: ver config/supabaseClient.ts (no contaminar el service client).
  const { data, error } = await supabaseAuthSession.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    // Los intentos fallidos NO se registran en la bitácora: el email podría
    // no pertenecer a nadie y no debe quedar asociado a una cuenta.
    throw new HttpError(401, 'Credenciales inválidas');
  }

  // Bitácora: inicio de sesión (empresa resuelta por email en `usuarios`).
  const { data: local } = await supabase
    .from('usuarios')
    .select('usuario_id, empresa_id')
    .eq('email', email)
    .maybeSingle();

  await logAudit('sesion', 'LOGIN', (local as Usuario | null)?.usuario_id ?? null, { email }, {
    authUserId: data.user.id,
    usuarioId: (local as Usuario | null)?.usuario_id,
    empresaId: (local as Usuario | null)?.empresa_id ?? null,
  });

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user.id,
  };
}

/** Perfil local del usuario + roles y permisos asignados dentro de su empresa. */
export async function me(email: string | undefined): Promise<{
  usuario: (Usuario & { empresa: { empresa_id: number; razon_social: string } | null }) | null;
  roles: Array<{ usuario_rol_id: number; rol_id: number; nombre: string }>;
  /** Unión de permisos activos de todos sus roles (RBAC fino, §13). */
  permisos: string[];
}> {
  if (!email) {
    throw new HttpError(401, 'El token no incluye un correo de acceso');
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*, empresas(empresa_id, razon_social)')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new HttpError(500, `No se pudo leer el usuario: ${error.message}`);
  if (!usuario) throw new HttpError(404, 'El usuario no tiene una cuenta registrada en la plataforma');

  const fila = usuario as Usuario & { empresas: { empresa_id: number; razon_social: string } | null };

  const { data: asignaciones } = await supabase
    .from('roles_usuarios')
    .select('usuario_rol_id, rol_id, estado, roles(nombre, estado, roles_permisos(permisos(nombre, estado)))')
    .eq('usuario_id', fila.usuario_id)
    .eq('estado', 'activo');

  const rolesActivos = (asignaciones ?? []).map((asignacion) => {
    const rol = asignacion.roles as unknown as {
      nombre: string;
      estado?: string;
      roles_permisos?: Array<{ permisos?: { nombre?: string; estado?: string } | null }>;
    } | null;
    return {
      usuario_rol_id: asignacion.usuario_rol_id,
      rol_id: asignacion.rol_id,
      nombre: rol?.nombre ?? 'sin-rol',
      activo: rol?.estado !== 'inactivo',
      permisos: (rol?.roles_permisos ?? [])
        .map((vinculo) => vinculo.permisos)
        .filter((permiso) => permiso?.nombre && permiso.estado !== 'inactivo')
        .map((permiso) => permiso!.nombre as string),
    };
  });

  const roles = rolesActivos.map(({ usuario_rol_id, rol_id, nombre }) => ({ usuario_rol_id, rol_id, nombre }));

  // El propietario es superusuario: hereda todos los permisos del catálogo
  // aunque `roles_permisos` esté vacío (mismo criterio que `requirePermission`).
  const esPropietario = rolesActivos.some((rol) => rol.activo && rol.nombre === 'propietario');
  const permisos = esPropietario
    ? [...ORG_PERMISSIONS]
    : [...new Set(rolesActivos.filter((rol) => rol.activo).flatMap((rol) => rol.permisos))].sort();

  const { empresas, ...resto } = fila;

  return {
    usuario: { ...resto, empresa: empresas ?? null },
    roles,
    permisos,
  };
}

export const authService = { register, login, me };
