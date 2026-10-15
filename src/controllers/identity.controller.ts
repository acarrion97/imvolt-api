// controllers/identity.controller.ts
// Módulos de identidad: organizaciones (tenants), usuarios y membresías.

import { Request, Response } from 'express';
import { createCrudRouter } from '../core/crud.factory';
import { organizacionRequest, usuarioRequest, membresiaRequest } from '../requests/identity.request';
import { organizacionResource, usuarioResource, membresiaResource } from '../resources/identity.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { filterByOrg, assignOrgOnCreate } from '../middlewares/tenantScope';
import { writeByOwnerOrAdmin } from '../middlewares/requireRole';
import supabase from '../config/supabaseClient';

// ── Organizaciones (RF-01: acceso multiempresa aislado) ─────────────────────
export const { router: organizacionRouter } = createCrudRouter({
  table: 'organizaciones',
  primaryKey: 'organization_id',
  request: organizacionRequest,
  resource: organizacionResource,
  entityName: 'Organización',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Membresías (roles por organización) ─────────────────────────────────────
export const { router: membresiaRouter } = createCrudRouter({
  table: 'membresias',
  primaryKey: 'membership_id',
  request: membresiaRequest,
  resource: membresiaResource,
  entityName: 'Membresía',
  middlewares: [...requireOrg, filterByOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, assignOrgOnCreate],
  tenantScoped: true,
  defaultGetAllOptions: { orderBy: 'created_at', ascending: false },
});

// ── Usuarios ────────────────────────────────────────────────────────────────
// El listado se acota a los usuarios con membresía activa en la organización
// activa: nunca se exponen perfiles de otras empresas.
const usuarios = createCrudRouter({
  table: 'usuarios',
  primaryKey: 'user_id',
  request: usuarioRequest,
  resource: usuarioResource,
  entityName: 'Usuario',
  middlewares: [...requireOrg],
  tenantScoped: false,
  handlers: {
    getAll: async (req: Request, res: Response) => {
      try {
        const { data: memberships, error: memberError } = await supabase
          .from('membresias')
          .select('user_id')
          .eq('organization_id', req.organizationId!)
          .eq('activo', true);

        if (memberError) throw new Error(memberError.message);

        const ids = (memberships ?? []).map((m) => m.user_id as string);
        if (ids.length === 0) {
          res.json([]);
          return;
        }

        const { data: users, error: usersError } = await supabase
          .from('usuarios')
          .select('*')
          .in('user_id', ids)
          .order('nombres', { ascending: true });

        if (usersError) throw new Error(usersError.message);
        res.json(usuarioResource.formatMany(users ?? []));
      } catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : 'Error al listar usuarios' });
      }
    },
  },
});

export const { router: usuarioRouter } = usuarios;
