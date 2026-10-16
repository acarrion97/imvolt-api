// docs/crud-paths.ts
// Generador de las operaciones OpenAPI de un CRUD.
//
// Cada módulo del API es un CRUD idéntico (listar, obtener, crear, actualizar,
// eliminar) generado por `core/crud.factory`. En vez de repetir el mismo YAML
// 20 veces, esta función construye las 6 operaciones con sus parámetros,
// ejemplos y respuestas de error, garantizando que la documentación quede
// siempre consistente entre módulos.

import { openapiSchemas } from './schemas';

export interface CrudDocFilter {
  name: string;
  description: string;
  /** Tipo del filtro en el querystring (por defecto integer). */
  type?: 'string' | 'integer' | 'number' | 'boolean';
  enum?: string[];
  example?: unknown;
}

export interface CrudDocConfig {
  /** Ruta base del recurso (debe coincidir con el `app.use` de index.ts). */
  path: string;
  /** Etiqueta de agrupación en Swagger. */
  tag: string;
  /** Esquema de respuesta (debe existir en components.schemas). */
  schema: string;
  /** Nombre humano usado en los resúmenes. */
  entity: string;
  /** Filtros adicionales soportados por el querystring. */
  filters?: CrudDocFilter[];
  /** Ejemplo del id en las rutas con parámetro. */
  idExample?: number;
  /** true si el nombre de la entidad es femenino ("una propiedad"). */
  female?: boolean;
  /** Plural del nombre (por defecto, `${entity}s`). */
  plural?: string;
}

const schemaRef = (schema: string): Record<string, unknown> => ({ $ref: `#/components/schemas/${schema}` });
const responseRef = (name: string): Record<string, unknown> => ({ $ref: `#/components/responses/${name}` });
const paramRef = (name: string): Record<string, unknown> => ({ $ref: `#/components/parameters/${name}` });

const json = (schema: Record<string, unknown>, example?: unknown): Record<string, unknown> => ({
  'application/json': example === undefined ? { schema } : { schema, example },
});

/** Construye las rutas OpenAPI de un recurso CRUD. */
export function crudPaths(config: CrudDocConfig): Record<string, any> {
  const { path, tag, schema, entity, filters = [], idExample = 1 } = config;
  const itemExample = openapiSchemas[schema]?.example;

  // Español: artículo y plural correctos según el género del nombre.
  const art = config.female ? { un: 'una', los: 'las' } : { un: 'un', los: 'los' };
  const nombre = entity.charAt(0).toLowerCase() + entity.slice(1);
  const pluralRaw = config.plural ?? `${entity}s`;
  const plural = pluralRaw.charAt(0).toLowerCase() + pluralRaw.slice(1);
  const fem = (femenino: string, masculino: string): string => (config.female ? femenino : masculino);

  const listParameters = [
    ...filters.map((filter) => ({
      name: filter.name,
      in: 'query',
      description: filter.description,
      schema: filter.enum
        ? { type: 'string', enum: filter.enum, example: filter.enum[0] }
        : { type: filter.type ?? 'integer', example: filter.example ?? 1 },
    })),
    paramRef('Limite'),
    paramRef('Pagina'),
    paramRef('Estado'),
  ];

  const idParameters = [
    {
      name: 'id',
      in: 'path',
      required: true,
      description: `Identificador del registro de ${nombre}`,
      schema: { type: 'integer', example: idExample },
    },
  ];

  const bodyWithExample = {
    required: true,
    content: json(schemaRef(`${schema}Input`), openapiSchemas[`${schema}Input`]?.example),
  };

  return {
    [path]: {
      get: {
        tags: [tag],
        summary: `Lista ${art.los} ${plural}`,
        description:
          `Devuelve ${art.los} ${plural} en orden de creación (más recientes primero). ` +
          'Se filtra por cualquier columna exacta del recurso (p. ej. `?empresa_id=1&estado=activo`), ' +
          'además de los filtros propios del módulo y la paginación `?limite=&pagina=`.',
        parameters: listParameters,
        responses: {
          200: {
            description: `Lista de ${plural}`,
            content: json({ type: 'array', items: schemaRef(schema) }, itemExample === undefined ? undefined : [itemExample]),
          },
          401: responseRef('Unauthorized'),
          403: responseRef('Forbidden'),
          500: responseRef('ServerError'),
        },
      },
      post: {
        tags: [tag],
        summary: `Crea ${art.un} ${nombre}`,
        description:
          'Valida el payload con Joi y crea el registro. Los campos no declarados se descartan ' +
          '(`stripUnknown`) y los campos obligatorios se listan en el esquema de entrada.',
        requestBody: bodyWithExample,
        responses: {
          201: { description: `${entity} ${fem('creada', 'creado')}`, content: json(schemaRef(schema), itemExample) },
          400: responseRef('BadRequest'),
          401: responseRef('Unauthorized'),
          403: responseRef('Forbidden'),
          500: responseRef('ServerError'),
        },
      },
    },
    [`${path}/{id}`]: {
      parameters: idParameters,
      get: {
        tags: [tag],
        summary: `Obtiene ${art.un} ${nombre} por id`,
        responses: {
          200: { description: `${entity} ${fem('encontrada', 'encontrado')}`, content: json(schemaRef(schema), itemExample) },
          401: responseRef('Unauthorized'),
          404: responseRef('NotFound'),
          500: responseRef('ServerError'),
        },
      },
      put: {
        tags: [tag],
        summary: `Actualiza ${art.un} ${nombre}`,
        description:
          'Actualización completa: se envían los campos a modificar. Todos son opcionales, ' +
          'pero los campos enviados deben ser válidos. `PATCH` es un alias registrado en la misma ruta.',
        requestBody: bodyWithExample,
        responses: {
          200: { description: `${entity} ${fem('actualizada', 'actualizado')}`, content: json(schemaRef(schema), itemExample) },
          400: responseRef('BadRequest'),
          401: responseRef('Unauthorized'),
          403: responseRef('Forbidden'),
          404: responseRef('NotFound'),
          500: responseRef('ServerError'),
        },
      },
      patch: {
        tags: [tag],
        summary: `Actualiza ${art.un} ${nombre} (alias PATCH)`,
        description: 'Mismo comportamiento que `PUT /{id}`: los campos no enviados conservan su valor.',
        requestBody: bodyWithExample,
        responses: {
          200: { description: `${entity} ${fem('actualizada', 'actualizado')}`, content: json(schemaRef(schema), itemExample) },
          400: responseRef('BadRequest'),
          401: responseRef('Unauthorized'),
          403: responseRef('Forbidden'),
          404: responseRef('NotFound'),
          500: responseRef('ServerError'),
        },
      },
      delete: {
        tags: [tag],
        summary: `Elimina ${art.un} ${nombre}`,
        description: 'Elimina el registro y deja traza en la auditoría del núcleo (`logAudit`).',
        responses: {
          200: {
            description: 'Registro eliminado',
            content: json(schemaRef('Mensaje'), { message: `${entity} ${fem('eliminada', 'eliminado')} correctamente` }),
          },
          401: responseRef('Unauthorized'),
          403: responseRef('Forbidden'),
          404: responseRef('NotFound'),
          500: responseRef('ServerError'),
        },
      },
    },
  };
}
