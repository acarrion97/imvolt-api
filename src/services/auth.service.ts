// services/auth.service.ts
// Registro, login y perfil de IMVOLT sobre Supabase Auth + tablas propias.
//
// Registro multi-empresa (§03): "una cuenta personal de agente se modela como
// una organización pequeña, no como una excepción al esquema". Al registrarse
// se crea:
//   1. el usuario en Supabase Auth,
//   2. la organización (tenant),
//   3. la membresía con rol `propietario`,
//   4. la wallet de créditos con los créditos de bienvenida.

import supabase from '../config/supabaseClient';
import { HttpError } from '../core/errors';
import { Membresia, Organizacion, Usuario } from '../models/identity.model';
import { creditsService } from './credits.service';

export interface RegisterInput {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
  organization_name: string;
  organization_type: 'desarrollador' | 'inmobiliaria' | 'agente';
  pais?: string;
}

export interface SessionResult {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

export async function register(input: RegisterInput): Promise<{ user_id: string }> {
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

  const { data: org, error: orgError } = await supabase
    .from('organizaciones')
    .insert([
      {
        nombre: input.organization_name,
        tipo: input.organization_type,
        pais: input.pais ?? 'Ecuador',
        activo: true,
      },
    ])
    .select()
    .single();

  if (orgError) throw new HttpError(500, `No se pudo crear la organización: ${orgError.message}`);

  const { error: memberError } = await supabase.from('membresias').insert([
    {
      user_id: userId,
      organization_id: (org as Organizacion).organization_id,
      rol: 'propietario',
      activo: true,
    },
  ]);

  if (memberError) throw new HttpError(500, `No se pudo crear la membresía: ${memberError.message}`);

  await supabase.from('usuarios').insert([
    {
      user_id: userId,
      nombres: input.nombres,
      apellidos: input.apellidos,
      email: input.email,
      activo: true,
    },
  ]);

  await creditsService.bootstrap((org as Organizacion).organization_id);

  return { user_id: userId };
}

export async function login(email: string, password: string): Promise<SessionResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new HttpError(401, 'Credenciales inválidas');
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user.id,
  };
}

export async function me(userId: string): Promise<{
  usuario: Usuario | null;
  membresias: Array<Pick<Membresia, 'membership_id' | 'organization_id' | 'rol'> & { organizacion: Pick<Organizacion, 'nombre' | 'tipo'> | null }>;
}> {
  const { data: usuario } = await supabase.from('usuarios').select('*').eq('user_id', userId).maybeSingle();

  const { data: membresias } = await supabase
    .from('membresias')
    .select('membership_id, organization_id, rol, organizaciones(nombre, tipo)')
    .eq('user_id', userId)
    .eq('activo', true);

  return {
    usuario: (usuario as Usuario) ?? null,
    membresias: ((membresias ?? []) as unknown as Array<
      Pick<Membresia, 'membership_id' | 'organization_id' | 'rol'> & { organizaciones: Pick<Organizacion, 'nombre' | 'tipo'> | null }
    >).map(({ organizaciones, ...rest }) => ({ ...rest, organizacion: organizaciones ?? null })),
  };
}

export const authService = { register, login, me };
