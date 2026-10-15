// models/identity.model.ts
// Identidad IMVOLT: organizaciones (tenants), usuarios y membresías con rol.
// Documento maestro §03 y §13.

export type TipoOrganizacion = 'desarrollador' | 'inmobiliaria' | 'agente';

export interface Organizacion {
  organization_id: string;
  nombre: string;
  tipo: TipoOrganizacion;
  ruc: string | null;
  pais: string;
  activo: boolean;
  created_at: string;
}

export interface Usuario {
  user_id: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  activo: boolean;
  created_at: string;
}

export type RolOrganizacion = 'propietario' | 'administrador' | 'marketing' | 'agente' | 'lector';

export interface Membresia {
  membership_id: string;
  user_id: string;
  organization_id: string;
  rol: RolOrganizacion;
  activo: boolean;
  created_at: string;
}
