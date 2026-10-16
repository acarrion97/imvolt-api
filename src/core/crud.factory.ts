// core/crud.factory.ts
// Factory híbrido del CRUD genérico.
//
// Combina las clases base (BaseService, BaseController) con una función que las
// instancia y arma el router Express completo de una sola vez:
//
//   const { router } = createCrudRouter<Categoria>({
//     table: 'categorias',
//     primaryKey: 'categoria_id',
//     request: categoriaRequest,
//     resource: categoriaResource,
//   });
//
// Permite además:
//   - middlewares globales del router (ej. sessionAuth).
//   - middlewares por escritura (ej. auth solo en create/update/remove).
//   - handlers personalizados que reemplazan al genérico.
//   - deshabilitar métodos que no apliquen.
//   - filtros por defecto de lectura (columnas, orden, paginación).
//   - registrar rutas extra (ej. GET /estadisticas) sobre el mismo router.

import { Request, RequestHandler, Response, Router } from 'express';
import { BaseController } from './base.controller';
import { BaseRequest } from './base.request';
import { BaseResource } from './base.resource';
import { BaseService, GetAllOptions } from './base.service';

export type CrudMethod = 'getAll' | 'getById' | 'create' | 'update' | 'remove';

export interface CrudRouterConfig<T> {
  /** Tabla de la base de datos. */
  table: string;
  /** Llave primaria (por defecto 'id'). */
  primaryKey?: string;
  /**
   * Relaciones (llaves foráneas) a incrustar en las respuestas, en sintaxis
   * PostgREST: p. ej. `['empresas(*)', 'tipos_propiedades(*)']`. El objeto
   * incrustado llega con el nombre de la TABLA foránea y el Resource lo
   * renombra a singular (p. ej. `empresas` → `empresa`).
   */
  joins?: string[];

  /** Request con validaciones + payload (opcional; sin él se usa req.body crudo). */
  request?: BaseRequest<T>;
  /** Resource con la vista de respuesta (opcional; sin él se devuelve el registro crudo). */
  resource?: BaseResource<any, any>;

  /** Servicio ya construido (para subclases con lógica propia). Si no, se instancia BaseService. */
  service?: BaseService<T>;
  /** Controlador ya construido (para subclases con handlers propios). */
  controller?: BaseController<T>;

  /** Entidad para los mensajes (ej. 'Categoría'). */
  entityName?: string;

  /** Middlewares aplicados a todas las rutas (ej. sessionAuth). */
  middlewares?: RequestHandler[];
  /** Middlewares solo para métodos de escritura (create/update/remove). */
  writeMiddlewares?: RequestHandler[];

  /** Handlers personalizados que reemplazan a los genéricos. */
  handlers?: Partial<Record<CrudMethod, RequestHandler>>;
  /** Métodos a deshabilitar (por defecto todos habilitados). */
  disabled?: CrudMethod[];

  /** Opciones por defecto de getAll: columnas seleccionadas y orden. */
  defaultGetAllOptions?: Pick<GetAllOptions, 'columns' | 'orderBy' | 'ascending'>;

  /** Rutas extra registradas sobre el mismo router (swagger + lógica propia). */
  extraRoutes?: (router: Router, controller: BaseController<T>, service: BaseService<T>) => void;

  /**
   * Acota update/remove a la organización activa del contexto (`req.organizationId`).
   * Si el registro pertenece a otra organización responde 404 (no filtra su
   * existencia). Debe usarse junto a `orgContext` y `defaultGetAllOptions`.
   */
  tenantScoped?: boolean;
}

export interface CrudRouterResult<T> {
  router: Router;
  service: BaseService<T>;
  controller: BaseController<T>;
}

export function createCrudRouter<T = any>(config: CrudRouterConfig<T>): CrudRouterResult<T> {
  const service =
    config.service ?? new BaseService<T>(config.table, config.primaryKey ?? 'id', config.joins ?? []);

  const controller =
    config.controller ??
    new BaseController<T>({
      service,
      request: config.request,
      resource: config.resource,
      entityName: config.entityName,
    });

  const router = Router();
  const globalMiddlewares = config.middlewares ?? [];
  const writeMiddlewares = config.writeMiddlewares ?? [];
  const disabled = new Set<CrudMethod>(config.disabled ?? []);
  const handlers = config.handlers ?? {};

  // getAll con filtros por querystring (?nombre=x&limite=20&pagina=2) más
  // las opciones por defecto de la configuración.
  const listHandler: RequestHandler = async (req: Request, res: Response) => {
    try {
      const { limite, pagina, ...filtros } = req.query as Record<string, string>;
      const limit = limite ? Number(limite) : undefined;
      const offset = pagina && limit ? (Number(pagina) - 1) * limit : undefined;

      const rows = await service.getAll({
        ...config.defaultGetAllOptions,
        where: filtros,
        limit,
        offset,
      });

      res.json(controller.formatMany(rows));
    } catch (error) {
      controller.sendError(res, error);
    }
  };

  const resolve = (method: CrudMethod, fallback: RequestHandler): RequestHandler =>
    handlers[method] ?? fallback;

  // Verifica que el registro pertenezca a la organización activa antes de
  // leerlo, editarlo o eliminarlo (multi-tenant). Si no existe o es de otra
  // organización responde 404, sin filtrar su existencia.
  const tenantGuard: RequestHandler = async (req: Request, res: Response, next) => {
    if (!config.tenantScoped || !req.organizationId) {
      next();
      return;
    }
    try {
      const row = (await service.getById(req.params.id)) as Record<string, unknown>;
      if (row.organization_id && String(row.organization_id) !== req.organizationId) {
        res.status(404).json({ message: `Registro no encontrado` });
        return;
      }
      next();
    } catch (error) {
      controller.sendError(res, error);
    }
  };

  if (!disabled.has('getAll')) {
    router.get('/', ...globalMiddlewares, resolve('getAll', listHandler));
  }
  if (!disabled.has('getById')) {
    router.get('/:id', ...globalMiddlewares, tenantGuard, resolve('getById', controller.getById));
  }
  if (!disabled.has('create')) {
    router.post('/', ...globalMiddlewares, ...writeMiddlewares, resolve('create', controller.create));
  }
  if (!disabled.has('update')) {
    router.put('/:id', ...globalMiddlewares, ...writeMiddlewares, tenantGuard, resolve('update', controller.update));
    // El frontend REST usa PATCH; se registra como alias de PUT.
    router.patch('/:id', ...globalMiddlewares, ...writeMiddlewares, tenantGuard, resolve('update', controller.update));
  }
  if (!disabled.has('remove')) {
    router.delete('/:id', ...globalMiddlewares, ...writeMiddlewares, tenantGuard, resolve('remove', controller.remove));
  }

  config.extraRoutes?.(router, controller, service);

  return { router, service, controller };
}
