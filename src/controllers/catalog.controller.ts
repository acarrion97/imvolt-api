// controllers/catalog.controller.ts
// Módulo Catálogo: proyectos inmobiliarios y media assets (medios en bucket
// privado con versiones).
//
//   GET/POST/PUT/PATCH/DELETE /proyectos        CRUD de proyectos (acotado a empresa)
//   GET/POST/PUT/PATCH/DELETE /media-assets     CRUD de metadatos de medios
//   POST   /media-assets/:id/versiones          multipart: sube una versión (100 MB)
//   GET    /media-assets/:id/versiones          historial (más reciente primero)
//   GET    /media-assets/:id/descarga           URL firmada de la versión activa
//   GET    /media-assets/:id/versiones/:vid/descarga   URL firmada de esa versión
//   POST   /media-assets/:id/versiones/:vid/restaurar  vuelve a activarla
//   DELETE /media-assets/:id/versiones/:vid            borra fila + blob
//   DELETE /media-assets/:id                           borra el medio y sus versiones
//
// El BLOB vive en el bucket PRIVADO `media-assets` (`services/media.storage.ts`):
// el API valida sesión + tenant + categoría, aplica el límite de 100 MB y el
// catálogo de MIME types, y solo devuelve URL firmadas de 5 minutos.

import { Request, RequestHandler, Response, Router } from 'express';
import multer from 'multer';

import { BaseController, auditContext } from '../core/base.controller';
import { BaseService } from '../core/base.service';
import { createCrudRouter } from '../core/crud.factory';
import { HttpError, NotFoundError, ValidationError } from '../core/errors';
import { requirePermission } from '../middlewares/requireRole';
import { filterByEmpresa } from '../middlewares/tenantScope';
import { requireOrg } from '../middlewares/sessionAuth';
import {
  MediaAsset,
  MediaAssetVersion,
  Proyecto,
} from '../models/catalog';
import { mediaAssetRequest, proyectoRequest } from '../requests/catalog.request';
import {
  mediaAssetResource,
  mediaAssetVersionResource,
  proyectoResource,
} from '../resources/catalog.resource';
import * as storage from '../services/media.storage';

/**
 * Relaciones incrustadas del medio. Entre `media_assets` y
 * `media_asset_versions` existen DOS llaves foráneas, así que PostgREST exige
 * elegir una: se usa `fk_media_asset_version_activa` (la versión activa).
 */
const JOINS_MEDIA = [
  'empresas(*)',
  'proyectos(*)',
  'propiedades(*)',
  'media_asset_versions!fk_media_asset_version_activa(*)',
];

// ── Servicios y controladores del módulo ─────────────────────────────────────
const proyectoService = new BaseService<Proyecto>('proyectos', 'proyecto_id', ['empresas(*)']);

const proyectoController = new BaseController<Proyecto>({
  service: proyectoService,
  request: proyectoRequest,
  resource: proyectoResource,
  entityName: 'Proyecto',
});

const mediaAssetService = new BaseService<MediaAsset>(
  'media_assets',
  'media_asset_id',
  JOINS_MEDIA
);

const mediaAssetController = new BaseController<MediaAsset>({
  service: mediaAssetService,
  request: mediaAssetRequest,
  resource: mediaAssetResource,
  entityName: 'Media asset',
});

const mediaAssetVersionService = new BaseService<MediaAssetVersion>(
  'media_asset_versions',
  'media_asset_version_id'
);

/**
 * El tenant no se mueve: `empresa_id` SIEMPRE es el de la sesión activa, tanto
 * al crear como al editar (a diferencia de `assignEmpresaOnCreate`, que solo
 * rellena el campo si falta y dejaría reasignar el registro a otra empresa
 * mediante un PATCH con `empresa_id` explícito).
 */
const empresaEnEscritura: RequestHandler = (req, _res, next) => {
  if (req.organizationId && req.body && typeof req.body === 'object') {
    req.body = { ...req.body, empresa_id: req.organizationId };
  }
  next();
};

/** Medio actual, o 404 si no existe o pertenece a otra empresa. */
async function mediaDeSesion(req: Request): Promise<MediaAsset> {
  const media = await mediaAssetService.getById<MediaAsset>(req.params.id);
  if (String(media.empresa_id) !== String(req.organizationId)) {
    throw new NotFoundError('Media asset');
  }
  return media;
}

/** Versión del medio, o 404 si no existe o pertenece a otro medio. */
async function versionDelMedia(
  mediaAssetId: string | number,
  versionId: string | number
): Promise<MediaAssetVersion> {
  let version: MediaAssetVersion;
  try {
    version = await mediaAssetVersionService.getById<MediaAssetVersion>(versionId);
  } catch {
    throw new NotFoundError('Versión de medio');
  }
  if (String(version.media_asset_id) !== String(mediaAssetId)) {
    throw new NotFoundError('Versión de medio');
  }
  return version;
}

/** Cuerpo de la descarga (el contrato que espera el cliente). */
async function payloadDescarga(version: MediaAssetVersion) {
  return {
    url: await storage.urlFirmada(version.ruta_storage),
    expira_en_segundos: storage.SEGUNDOS_URL_FIRMADA,
    nombre_archivo: version.nombre_archivo,
    mime_type: version.mime_type ?? null,
    tamano_bytes: version.tamano_bytes ?? null,
    numero: version.numero,
  };
}

// ── Subida multipart (memoria + límite de 100 MB) ───────────────────────────
const subirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: storage.LIMITE_BYTES_ARCHIVO,
    files: 1,
    fields: 5,
    fieldSize: 16 * 1024,
  },
}).single('archivo');

/** Traduce los errores de multer a los códigos HTTP del API (413 / 400). */
const subidaMiddleware: RequestHandler = (req, res, next) => {
  subirArchivo(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        message: `El archivo supera el máximo de ${storage.LIMITE_BYTES_ARCHIVO / 1024 / 1024} MB.`,
      });
      return;
    }
    res.status(400).json({
      message:
        error instanceof multer.MulterError
          ? `Archivo rechazado: ${error.message}`
          : 'No se pudo leer el archivo adjunto.',
    });
  });
};

/** `DELETE /media-assets/:id` — borra blobs, versiones y luego el medio. */
const eliminarMediaAsset: RequestHandler = async (req: Request, res: Response) => {
  try {
    const media = await mediaDeSesion(req);

    const versiones = await mediaAssetVersionService.getAll<MediaAssetVersion>({
      where: { media_asset_id: media.media_asset_id },
    });

    // Los blobs se borran antes que las filas. Mejor-esfuerzo: un blob ya
    // inexistente no debe impedir limpiar la base.
    if (versiones.length) {
      await storage
        .borrarArchivos(versiones.map((version) => version.ruta_storage))
        .catch((error) =>
          console.warn('[media-assets] No se pudieron borrar blobs:', (error as Error).message)
        );
      for (const version of versiones) {
        await mediaAssetVersionService.remove(version.media_asset_version_id, auditContext(req));
      }
    }

    await mediaAssetService.remove(media.media_asset_id, auditContext(req));
    res.json({ message: 'Media asset eliminado correctamente' });
  } catch (error) {
    mediaAssetController.sendError(res, error);
  }
};

// ── Rutas propias de storage (registradas sobre el mismo router) ─────────────
function registrarRutasStorage(router: Router): void {
  // GET /:id/versiones — historial completo, la versión más reciente primero.
  router.get('/:id/versiones', ...requireOrg, async (req: Request, res: Response) => {
    try {
      const media = await mediaDeSesion(req);
      const versiones = await mediaAssetVersionService.getAll<MediaAssetVersion>({
        where: { media_asset_id: media.media_asset_id },
        orderBy: 'numero',
        ascending: false,
      });
      res.json(mediaAssetVersionResource.formatMany(versiones));
    } catch (error) {
      mediaAssetController.sendError(res, error);
    }
  });

  // POST /:id/versiones — multipart con el campo `archivo` y `nota` opcional.
  router.post(
    '/:id/versiones',
    ...requireOrg,
    requirePermission('crear_contenidos'),
    subidaMiddleware,
    async (req: Request, res: Response) => {
      try {
        const media = await mediaDeSesion(req);

        const file = req.file;
        if (!file) {
          throw new ValidationError('Adjunta un archivo en el campo "archivo".');
        }

        // Límite + tipo de archivo según la categoría del medio.
        const mime = storage.validarArchivo(
          { nombre: file.originalname, mime: file.mimetype, bytes: file.size },
          media.categoria
        );
        const nombre = storage.nombreArchivoSeguro(file.originalname);

        // Número correlativo de versión (1, 2, 3…): se lee el máximo actual.
        const previas = await mediaAssetVersionService.getAll<Pick<MediaAssetVersion, 'numero'>>({
          where: { media_asset_id: media.media_asset_id },
          columns: ['numero'],
        });
        const numero = previas.reduce((max, version) => Math.max(max, version.numero), 0) + 1;
        const ruta = storage.rutaVersion(media.empresa_id, media.media_asset_id, numero, nombre);

        await storage.subirArchivo(ruta, file.buffer, mime);

        let version: MediaAssetVersion;
        try {
          version = await mediaAssetVersionService.create<MediaAssetVersion>(
            {
              media_asset_id: media.media_asset_id,
              numero,
              nombre_archivo: nombre,
              ruta_storage: ruta,
              mime_type: mime,
              tamano_bytes: file.size,
              nota: normalizarNota(req.body?.nota),
              subido_por: req.localUsuarioId ?? null,
              empresa_id: media.empresa_id,
            },
            auditContext(req)
          );
        } catch (error) {
          // No dejar un blob huérfano si la fila no pudo crearse.
          await storage.borrarArchivos([ruta]).catch(() => undefined);
          throw error;
        }

        // La versión recién subida pasa a ser la activa.
        await mediaAssetService.update(
          media.media_asset_id,
          { version_activa_id: version.media_asset_version_id },
          auditContext(req)
        );

        res.status(201).json(mediaAssetVersionResource.format(version));
      } catch (error) {
        mediaAssetController.sendError(res, error);
      }
    }
  );

  // GET /:id/descarga — URL firmada de la versión activa (5 minutos).
  router.get('/:id/descarga', ...requireOrg, async (req: Request, res: Response) => {
    try {
      const media = await mediaDeSesion(req);
      if (!media.version_activa_id) {
        throw new HttpError(404, 'Este medio aún no tiene versiones para descargar.');
      }
      const version = await versionDelMedia(media.media_asset_id, media.version_activa_id);
      res.json(await payloadDescarga(version));
    } catch (error) {
      mediaAssetController.sendError(res, error);
    }
  });

  // GET /:id/versiones/:vid/descarga — URL firmada de una versión puntual.
  router.get(
    '/:id/versiones/:vid/descarga',
    ...requireOrg,
    async (req: Request, res: Response) => {
      try {
        await mediaDeSesion(req);
        const version = await versionDelMedia(req.params.id, req.params.vid);
        res.json(await payloadDescarga(version));
      } catch (error) {
        mediaAssetController.sendError(res, error);
      }
    }
  );

  // POST /:id/versiones/:vid/restaurar — esa versión vuelve a ser la activa.
  router.post(
    '/:id/versiones/:vid/restaurar',
    ...requireOrg,
    requirePermission('crear_contenidos'),
    async (req: Request, res: Response) => {
      try {
        const media = await mediaDeSesion(req);
        const version = await versionDelMedia(media.media_asset_id, req.params.vid);
        await mediaAssetService.update(
          media.media_asset_id,
          { version_activa_id: version.media_asset_version_id },
          auditContext(req)
        );
        const actualizado = await mediaAssetService.getById<MediaAsset>(media.media_asset_id);
        res.json(mediaAssetResource.format(actualizado));
      } catch (error) {
        mediaAssetController.sendError(res, error);
      }
    }
  );

  // DELETE /:id/versiones/:vid — borra el blob y la fila; si era la activa,
  // activa la versión más reciente restante (o deja el medio sin versión).
  router.delete(
    '/:id/versiones/:vid',
    ...requireOrg,
    requirePermission('crear_contenidos'),
    async (req: Request, res: Response) => {
      try {
        const media = await mediaDeSesion(req);
        const version = await versionDelMedia(media.media_asset_id, req.params.vid);

        await storage.borrarArchivos([version.ruta_storage]);
        await mediaAssetVersionService.remove(version.media_asset_version_id, auditContext(req));

        if (String(media.version_activa_id) === String(version.media_asset_version_id)) {
          const restantes = await mediaAssetVersionService.getAll<MediaAssetVersion>({
            where: { media_asset_id: media.media_asset_id },
            orderBy: 'numero',
            ascending: false,
          });
          const siguiente = restantes[0] ?? null;
          await mediaAssetService.update(
            media.media_asset_id,
            { version_activa_id: siguiente?.media_asset_version_id ?? null },
            auditContext(req)
          );
        }

        res.json({ message: 'Versión eliminada correctamente' });
      } catch (error) {
        mediaAssetController.sendError(res, error);
      }
    }
  );
}

/** Nota de versión: opcional, recortada a 500 caracteres. */
function normalizarNota(nota: unknown): string | null {
  if (typeof nota !== 'string') return null;
  const limpio = nota.trim();
  return limpio ? limpio.slice(0, 500) : null;
}

// ── Routers del módulo ───────────────────────────────────────────────────────
export const { router: proyectoRouter } = createCrudRouter<Proyecto>({
  table: 'proyectos',
  primaryKey: 'proyecto_id',
  joins: ['empresas(*)'],
  request: proyectoRequest,
  resource: proyectoResource,
  entityName: 'Proyecto',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [requirePermission('gestionar_propiedades'), empresaEnEscritura],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});

export const { router: mediaAssetRouter } = createCrudRouter<MediaAsset>({
  table: 'media_assets',
  primaryKey: 'media_asset_id',
  joins: JOINS_MEDIA,
  service: mediaAssetService,
  controller: mediaAssetController,
  request: mediaAssetRequest,
  resource: mediaAssetResource,
  entityName: 'Media asset',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [requirePermission('crear_contenidos'), empresaEnEscritura],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
  handlers: { remove: eliminarMediaAsset },
  extraRoutes: registrarRutasStorage,
});
