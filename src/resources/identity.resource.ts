// resources/identity.resource.ts
// Vistas de identidad. Reciben la fila cruda de BD y normalizan la salida.

import { BaseResource } from '../core/base.resource';

export const organizacionResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  organization_id: row.organization_id,
  nombre: row.nombre,
  tipo: row.tipo,
  ruc: row.ruc ?? null,
  pais: row.pais ?? null,
  activo: row.activo ?? true,
  created_at: row.created_at,
}));

export const usuarioResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  user_id: row.user_id,
  nombres: row.nombres,
  apellidos: row.apellidos,
  email: row.email,
  telefono: row.telefono ?? null,
  activo: row.activo ?? true,
  created_at: row.created_at,
}));

export const membresiaResource = new BaseResource<any, Record<string, unknown>>((row) => ({
  membership_id: row.membership_id,
  user_id: row.user_id,
  organization_id: row.organization_id,
  rol: row.rol,
  activo: row.activo ?? true,
  created_at: row.created_at,
}));
