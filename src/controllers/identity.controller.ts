// controllers/identity.controller.ts
// CRUD del módulo Identidad (diagrama relacional):
// empresas, usuarios, roles, permisos, asignaciones rol↔usuario y rol↔permiso,
// hitos de lanzamiento, configuraciones de integración y sus vínculos.
//
// El CRUD genérico vive en `core/crud.factory`: cada export es un router
// Express completo (GET /, GET /:id, POST /, PUT /:id, PATCH /:id, DELETE /:id)
// con validación (Request), vista de respuesta (Resource), sesión y RBAC.
//
// Sobre ese genérico, usuarios y asignaciones de rol añaden las reglas de
// GESTIÓN DE EQUIPO (services/miembros.service.ts):
//   - invitación de miembros (POST /usuarios/invitaciones),
//   - asignaciones acotadas a la empresa activa y sin duplicados (409),
//   - la empresa nunca se queda sin propietario activo.

import { Request, RequestHandler, Response } from 'express';
import { auditContext, BaseController, BaseService, createCrudRouter, HttpError, NotFoundError, ValidationError } from '../core';
import {
  configuracionIntegracionRequest,
  empresaHitoRequest,
  empresaIntegracionRequest,
  empresaRequest,
  hitoLanzamientoRequest,
  invitacionRequest,
  permisoRequest,
  rolPermisoRequest,
  rolRequest,
  usuarioRequest,
  usuarioRolRequest,
} from '../requests/identity.request';
import {
  auditLogResource,
  configuracionIntegracionResource,
  empresaHitoResource,
  empresaIntegracionResource,
  empresaResource,
  hitoLanzamientoResource,
  permisoResource,
  rolPermisoResource,
  rolResource,
  usuarioResource,
  usuarioRolResource,
} from '../resources/identity.resource';
import { requireOrg } from '../middlewares/sessionAuth';
import { assignEmpresaOnCreate, filterByEmpresa } from '../middlewares/tenantScope';
import { manageUsers, writeByOwnerOrAdmin } from '../middlewares/requireRole';
import { Rol } from '../models/identity/rol.model';
import { UsuarioView } from '../models/identity/usuario.model';
import { UsuarioRolView } from '../models/identity/usuario_rol.model';
import { asegurarPropietarioRestante, invitarMiembro, rolValido } from '../services/miembros.service';

const SEGMENTO = {
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
};

// ── Empresas (tenant) ───────────────────────────────────────────────────────
export const { router: empresaRouter } = createCrudRouter({
  table: 'empresas',
  primaryKey: 'empresa_id',
  request: empresaRequest,
  resource: empresaResource,
  entityName: 'Empresa',
  ...SEGMENTO,
  // La empresa ES el propio tenant: el listado se acota a la de la sesión y
  // cada lectura/escritura por id exige que coincida con `empresa_id` activo.
  // Sin esto, cualquier cuenta autenticada podía listar y editar empresas
  // ajenas (GET /empresas devolvía todas las cuentas de la plataforma).
  middlewares: [...requireOrg, filterByEmpresa],
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});

// ── Usuarios (miembros de la empresa) ──────────────────────────────────────
// Además del CRUD genérico, el listado incrusta el rol activo de cada miembro
// (`roles_usuarios → roles`) para que el frontend no tenga que cruzar tablas.
const USUARIO_JOINS = ['empresas(*)', 'roles_usuarios(estado, roles(nombre, estado))'];

const ASIGNACION_JOINS = ['usuarios(*, empresas(*))', 'roles(*)'];

const usuarioService = new BaseService<UsuarioView>('usuarios', 'usuario_id', USUARIO_JOINS);

const usuarioController = new BaseController<UsuarioView>({
  service: usuarioService,
  request: usuarioRequest,
  resource: usuarioResource,
  entityName: 'Usuario',
});

/** UPDATE con guardas: no auto-desactivarse ni dejar la empresa sin propietario. */
const actualizarUsuario: RequestHandler = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const payload = usuarioRequest.validateUpdate(req.body);

    // RF-01/P0: la empresa es el tenant y no se cambia por PATCH. Un usuario
    // que cambie de compañía se da de baja aquí y se invita en la otra.
    if (payload.empresa_id !== undefined) {
      const actual = (await usuarioService.getById(id)) as UsuarioView;
      if (Number(payload.empresa_id) !== Number(actual.empresa_id)) {
        throw new ValidationError('No se puede reasignar el usuario a otra empresa', [
          { field: 'empresa_id', message: 'Crea el miembro en la empresa destino con POST /usuarios/invitaciones' },
        ]);
      }
    }

    if (id === req.localUsuarioId && payload.estado === 'inactivo') {
      throw new ValidationError('No puedes desactivar tu propia cuenta: pide a otro administrador que lo haga');
    }

    const antes = (await usuarioService.getById(id)) as UsuarioView;
    if (payload.estado === 'inactivo') {
      await asegurarPropietarioRestante(antes.empresa_id, { usuarioId: id });
    }

    res.json(usuarioController.format(await usuarioService.update(id, payload, auditContext(req))));
  } catch (error) {
    usuarioController.sendError(res, error);
  }
};

/** DELETE con guardas: no borrarse a sí mismo ni perder al propietario. */
const eliminarUsuario: RequestHandler = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (id === req.localUsuarioId) {
      throw new ValidationError('No puedes eliminar tu propia cuenta de usuario');
    }

    const antes = (await usuarioService.getById(id)) as UsuarioView;
    await asegurarPropietarioRestante(antes.empresa_id, { usuarioId: id });
    await usuarioService.remove(id, auditContext(req));

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    usuarioController.sendError(res, error);
  }
};

/** POST /usuarios/invitaciones — alta de miembro con credencial temporal. */
const invitarHandler: RequestHandler = async (req: Request, res: Response) => {
  try {
    const input = invitacionRequest.validateCreate(req.body);

    const resultado = await invitarMiembro(input, {
      authUserId: req.userId,
      usuarioId: req.localUsuarioId,
      empresaId: req.organizationId as string,
    });

    res.status(201).json({ message: 'Miembro invitado correctamente', ...resultado });
  } catch (error) {
    usuarioController.sendError(res, error);
  }
};

export const { router: usuarioRouter } = createCrudRouter<UsuarioView>({
  table: 'usuarios',
  primaryKey: 'usuario_id',
  joins: USUARIO_JOINS,
  service: usuarioService,
  controller: usuarioController,
  request: usuarioRequest,
  resource: usuarioResource,
  entityName: 'Usuario',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByOwnerOrAdmin, manageUsers, assignEmpresaOnCreate],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  handlers: { update: actualizarUsuario, remove: eliminarUsuario },
  extraRoutes: (router) => {
    router.post('/invitaciones', ...requireOrg, writeByOwnerOrAdmin, manageUsers, invitarHandler);
  },
});

// ── Roles ───────────────────────────────────────────────────────────────────
export const { router: rolRouter } = createCrudRouter({
  table: 'roles',
  primaryKey: 'rol_id',
  request: rolRequest,
  resource: rolResource,
  entityName: 'Rol',
  ...SEGMENTO,
});

// ── Permisos ────────────────────────────────────────────────────────────────
export const { router: permisoRouter } = createCrudRouter({
  table: 'permisos',
  primaryKey: 'permiso_id',
  request: permisoRequest,
  resource: permisoResource,
  entityName: 'Permiso',
  ...SEGMENTO,
});

// ── Roles ↔ Usuarios (membresía: qué rol tiene cada miembro) ───────────────
// El CRUD genérico no basta aquí: una asignación debe pertenecer a la empresa
// activa (roleo cruzando tenants), no duplicarse (constraint unique → 409) y
// nunca dejar a la empresa sin propietario.
const asignacionService = new BaseService<UsuarioRolView>('roles_usuarios', 'usuario_rol_id', ASIGNACION_JOINS);

const asignacionController = new BaseController<UsuarioRolView>({
  service: asignacionService,
  request: usuarioRolRequest,
  resource: usuarioRolResource,
  entityName: 'Asignación de rol',
});

const rolService = new BaseService<Rol>('roles', 'rol_id');

/** Usuario de la asignación, comprobando que pertenezca a la empresa activa. */
const usuarioDeLaEmpresa = async (req: Request, usuarioId: number): Promise<UsuarioView> => {
  const usuario = (await usuarioService.getById(usuarioId)) as UsuarioView;
  if (String(usuario.empresa_id) !== req.organizationId) throw new NotFoundError('Usuario');
  return usuario;
};

/** Valida que el rol exista, esté activo y sea del catálogo §13. */
const validarRol = async (rolId: number): Promise<Rol> => {
  const rol = (await rolService.getById(rolId)) as Rol;
  if (rol.estado === 'inactivo') {
    throw new ValidationError('El rol seleccionado está inactivo', [
      { field: 'rol_id', message: 'Selecciona un rol activo del catálogo' },
    ]);
  }
  rolValido(rol.nombre);
  return rol;
};

/** El mismo usuario no puede tener dos veces el mismo rol (409). */
const asignacionPrevia = async (usuarioId: number, rolId: number, excluirId?: number): Promise<void> => {
  const previa = await asignacionService.findOne({ usuario_id: usuarioId, rol_id: rolId });
  if (previa && Number((previa as { usuario_rol_id: number }).usuario_rol_id) !== Number(excluirId ?? -1)) {
    throw new HttpError(409, 'El usuario ya tiene asignado ese rol');
  }
};

/**
 * GET / — listado de asignaciones de la empresa activa.
 *
 * Conserva los filtros del CRUD genérico (`?usuario_id=3&rol_id=2&limite=20`)
 * y añade el acote multi-tenant: solo las asignaciones de los miembros de la
 * empresa del token (`roles_usuarios` no tiene columna `empresa_id`, así que
 * el filtro se aplica sobre el usuario incrustado).
 */
const listarAsignaciones: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { limite, pagina, ...filtros } = req.query as Record<string, string>;
    const limit = limite ? Number(limite) : undefined;
    const offset = pagina && limit ? (Number(pagina) - 1) * limit : undefined;

    const rows = await asignacionService.getAll({
      orderBy: 'creado_en',
      ascending: false,
      where: filtros,
      limit,
      offset,
    });

    res.json(asignacionController.formatMany(rows.filter((fila) => empresaDe(fila) === req.organizationId)));
  } catch (error) {
    asignacionController.sendError(res, error);
  }
};

/** POST / — asignar un rol a un miembro de la propia empresa. */
const asignarRol: RequestHandler = async (req: Request, res: Response) => {
  try {
    const payload = usuarioRolRequest.validateCreate(req.body);
    await usuarioDeLaEmpresa(req, payload.usuario_id);
    await validarRol(payload.rol_id);
    await asignacionPrevia(payload.usuario_id, payload.rol_id);

    const row = await asignacionService.create(payload, auditContext(req));
    res.status(201).json(asignacionController.format(row));
  } catch (error) {
    asignacionController.sendError(res, error);
  }
};

/** PUT/PATCH /:id — cambiar el rol o el miembro de una asignación. */
const cambiarAsignacion: RequestHandler = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const payload = usuarioRolRequest.validateUpdate(req.body);
    const antes = (await asignacionService.getById(id)) as UsuarioRolView & Record<string, unknown>;

    if (empresaDe(antes) !== req.organizationId) throw new NotFoundError('Asignación de rol');
    if (payload.usuario_id !== undefined) await usuarioDeLaEmpresa(req, payload.usuario_id);
    if (payload.rol_id !== undefined) await validarRol(payload.rol_id);

    await asignacionPrevia(
      payload.usuario_id ?? Number(antes.usuario_id),
      payload.rol_id ?? Number(antes.rol_id),
      id
    );

    // Dejar de ser propietario (cambio de rol o revocación lógica) solo si
    // queda al menos otro propietario activo.
    const rolAntes = (antes.roles as unknown as Rol | null)?.nombre;
    const dejaDeEstarActivo =
      (payload.rol_id !== undefined && Number(antes.rol_id) !== payload.rol_id) ||
      payload.estado === 'inactivo';

    if (rolAntes === 'propietario' && dejaDeEstarActivo) {
      await asegurarPropietarioRestante(req.organizationId, { asignacionId: id });
    }

    res.json(asignacionController.format(await asignacionService.update(id, payload, auditContext(req))));
  } catch (error) {
    asignacionController.sendError(res, error);
  }
};

/** DELETE /:id — revocar un rol (con la misma guarda del propietario). */
const revocarRol: RequestHandler = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const antes = (await asignacionService.getById(id)) as UsuarioRolView & Record<string, unknown>;

    if (empresaDe(antes) !== req.organizationId) throw new NotFoundError('Asignación de rol');
    if ((antes.roles as unknown as Rol | null)?.nombre === 'propietario') {
      await asegurarPropietarioRestante(req.organizationId, { asignacionId: id });
    }

    await asignacionService.remove(id, auditContext(req));
    res.json({ message: 'Asignación de rol eliminada correctamente' });
  } catch (error) {
    asignacionController.sendError(res, error);
  }
};

/** Empresa del usuario incrustado en la asignación (`usuarios → empresas`). */
function empresaDe(fila: unknown): string | null {
  const usuarios = (fila as { usuarios?: { empresa_id?: number } | null } | null)?.usuarios;
  return usuarios?.empresa_id != null ? String(usuarios.empresa_id) : null;
}

export const { router: usuarioRolRouter } = createCrudRouter<UsuarioRolView>({
  table: 'roles_usuarios',
  primaryKey: 'usuario_rol_id',
  joins: ASIGNACION_JOINS,
  service: asignacionService,
  controller: asignacionController,
  request: usuarioRolRequest,
  resource: usuarioRolResource,
  entityName: 'Asignación de rol',
  middlewares: [...requireOrg],
  writeMiddlewares: [writeByOwnerOrAdmin, manageUsers],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  handlers: {
    getAll: listarAsignaciones,
    create: asignarRol,
    update: cambiarAsignacion,
    remove: revocarRol,
  },
});

// ── Roles ↔ Permisos ────────────────────────────────────────────────────────
export const { router: rolPermisoRouter } = createCrudRouter({
  table: 'roles_permisos',
  primaryKey: 'permiso_rol_id',
  joins: ['roles(*)', 'permisos(*)'],
  request: rolPermisoRequest,
  resource: rolPermisoResource,
  entityName: 'Permiso de rol',
  ...SEGMENTO,
});

// ── Hitos de lanzamiento ────────────────────────────────────────────────────
export const { router: hitoLanzamientoRouter } = createCrudRouter({
  table: 'hitos_lanzamientos',
  primaryKey: 'hito_lanzamiento_id',
  request: hitoLanzamientoRequest,
  resource: hitoLanzamientoResource,
  entityName: 'Hito de lanzamiento',
  ...SEGMENTO,
});

// ── Hitos por empresa ───────────────────────────────────────────────────────
export const { router: empresaHitoRouter } = createCrudRouter({
  table: 'empresas_hitos',
  primaryKey: 'empresa_hito_id',
  joins: ['empresas(*)', 'hitos_lanzamientos(*)'],
  request: empresaHitoRequest,
  resource: empresaHitoResource,
  entityName: 'Hito de la empresa',
  ...SEGMENTO,
});

// ── Configuración de integración ────────────────────────────────────────────
export const { router: configuracionIntegracionRouter } = createCrudRouter({
  table: 'configuraciones_integraciones',
  primaryKey: 'configuracion_integracion_id',
  request: configuracionIntegracionRequest,
  resource: configuracionIntegracionResource,
  entityName: 'Configuración de integración',
  ...SEGMENTO,
});

// ── Integraciones por empresa ───────────────────────────────────────────────
export const { router: empresaIntegracionRouter } = createCrudRouter({
  table: 'empresas_integraciones',
  primaryKey: 'empresa_integracion_id',
  joins: ['empresas(*)', 'integraciones(*)', 'configuraciones_integraciones(*)'],
  request: empresaIntegracionRequest,
  resource: empresaIntegracionResource,
  entityName: 'Integración de la empresa',
  ...SEGMENTO,
});

// ── Auditoría (SOLO LECTURA) ────────────────────────────────────────────────
// La escribe el núcleo (`services/audit.service.ts`) en cada escritura y en
// el registro/inicio de sesión. Aquí solo se consulta, siempre dentro de la
// empresa activa y solo para propietario y administrador.
export const { router: auditLogRouter } = createCrudRouter({
  table: 'audit_logs',
  primaryKey: 'audit_log_id',
  joins: ['usuarios(*, empresas(*))', 'empresas(*)'],
  resource: auditLogResource,
  entityName: 'Registro de auditoría',
  middlewares: [...requireOrg, filterByEmpresa, writeByOwnerOrAdmin],
  disabled: ['create', 'update', 'remove'],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
});
