// middlewares/contract.ts
// Traducción de contratos entre el frontend y el diagrama relacional.
//
// El frontend (§09–§16) nombra los campos en su propio dialecto —
// `property_id`, `connection_id`, `copy`, `fuente`, `estado` del flujo §10…
// mientras la base sigue el diagrama: `propiedad_id`, `conexion_id`,
// `copy_anuncio`, `origen`, `estado_flujo`.
//
// En vez de renombrar en cada controller, estos dos middlewares mapean
// body/query ANTES de que Joi valide (`stripUnknown` descartaría campos mal
// nombrados) y ANTES de que el listado convierta el querystring en filtros
// exactos de columna. A partir de ahí todo el módulo trabaja con nombres de
// la tabla.
//
//   middlewares:    [...requireOrg, filterByEmpresa, translateQuery(CAMPAIGN_QUERY)]
//   writeMiddlewares: [translateBody(CAMPAIGN_BODY), forceEmpresa, …]

import { Request, RequestHandler } from 'express';

/** Mapa "campo del contrato del frontend" → "columna de la tabla". */
export type ContractMap = Record<string, string>;

function renombrar(origen: Record<string, unknown>, map: ContractMap): void {
  for (const [campo, columna] of Object.entries(map)) {
    if (!(campo in origen)) continue;
    // Si el cliente envía ambos, gana el que ya está en formato de columna.
    if (!(columna in origen)) origen[columna] = origen[campo];
    delete origen[campo];
  }
}

/** Renombra los campos del body recibidos del frontend a columnas de la tabla. */
export const translateBody =
  (map: ContractMap): RequestHandler =>
  (req, _res, next) => {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      renombrar(req.body as Record<string, unknown>, map);
    }
    next();
  };

/**
 * Resuelve un campo del body de forma asíncrona (p. ej. `objetivo` →
 * `objetivo_publicidad_id` buscando por nombre) y lo deja como clave nueva.
 * Corre **después** de `translateBody` y **antes** del `validate()`.
 */
export function resolveField(
  fromKey: string,
  toKey: string,
  resolver: (value: unknown, req: Request) => Promise<unknown>,
): RequestHandler {
  return (req, _res, next) => {
    const value = (req.body as Record<string, unknown> | undefined)?.[fromKey];
    if (value === undefined || value === null || value === '') {
      next();
      return;
    }
    resolver(value, req)
      .then((resolved) => {
        const body = req.body as Record<string, unknown>;
        if (resolved !== undefined && resolved !== null) body[toKey] = resolved;
        delete body[fromKey];
        next();
      })
      .catch(next);
  };
}

/** Renombra filtros de querystring (`?property_id=3` → `?propiedad_id=3`). */
export const translateQuery =
  (map: ContractMap): RequestHandler =>
  (req, _res, next) => {
    renombrar(req.query as Record<string, unknown>, map);
    next();
  };
