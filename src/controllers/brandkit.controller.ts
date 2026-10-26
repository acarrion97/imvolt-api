// controllers/brandkit.controller.ts
// Brand Kit: archivos de marca y colores de la paleta (RF — identidad).
//
//   GET    /brand-assets                       CRUD de metadatos (acotado a empresa)
//   POST   /brand-assets/:id/versiones         multipart: sube una versión (10 MB)
//   GET    /brand-assets/:id/versiones         historial (más reciente primero)
//   GET    /brand-assets/:id/descarga          URL firmada de la versión activa
//   GET    /brand-assets/:id/versiones/:vid/descarga    URL firmada de esa versión
//   POST   /brand-assets/:id/versiones/:vid/restaurar   vuelve a activarla
//   DELETE /brand-assets/:id/versiones/:vid             borra fila + blob
//   DELETE /brand-assets/:id                            borra el archivo y sus versiones
//
// El BLOB vive en el bucket PRIVADO `brand-kit` (`services/brandkit.storage.ts`):
// el API valida sesión + tenant + categoría, aplica el límite de 10 MB y el
// catálogo de MIME types, y solo devuelve URL firmadas de 5 minutos.

import { Request, RequestHandler, Response, Router } from 'express';
import multer from 'multer';

import { BaseController } from '../core/base.controller';
import { BaseService } from '../core/base.service';
import { createCrudRouter } from '../core/crud.factory';
import { HttpError, NotFoundError, ValidationError } from '../core/errors';
import { writeByMarketing } from '../middlewares/requireRole';
import { filterByEmpresa } from '../middlewares/tenantScope';
import { requireOrg } from '../middlewares/sessionAuth';
import { BrandAsset, BrandAssetVersion, BrandColor } from '../models/brandkit';
import { brandAssetRequest, brandColorRequest } from '../requests/brandkit.request';
import {
  brandAssetResource,
  brandAssetVersionResource,
  brandColorResource,
} from '../resources/brandkit.resource';
import { AuditContext } from '../services/audit.service';
import * as storage from '../services/brandkit.storage';

/**
 * Relaciones incrustadas del archivo. Entre `brand_assets` y
 * `brand_asset_versions` existen DOS llaves foráneas, así que PostgREST exige
 * elegir una: se usa `fk_brand_asset_version_activa` (la versión activa).
 */
const JOINS_ASSET = ['empresas(*)', 'brand_asset_versions!fk_brand_asset_version_activa(*)'];

// ── Servicios y controladores del módulo ─────────────────────────────────────
const brandAssetService = new BaseService<BrandAsset>(
  'brand_assets',
  'brand_asset_id',
  JOINS_ASSET
);

const brandAssetController = new BaseController<BrandAsset>({
  service: brandAssetService,
  request: brandAssetRequest,
  resource: brandAssetResource,
  entityName: 'Archivo de marca',
});

const brandAssetVersionService = new BaseService<BrandAssetVersion>(
  'brand_asset_versions',
  'brand_asset_version_id'
);

// ── Utilidades de sesión ─────────────────────────────────────────────────────
/** Autor de la acción para la bitácora (`audit_logs`). */
const audit = (req: Request): AuditContext => ({
  authUserId: req.userId,
  usuarioId: req.localUsuarioId,
  empresaId: req.organizationId ?? null,
});

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

/** Archivo actual, o 404 si no existe o pertenece a otra empresa. */
async function assetDeSesion(req: Request): Promise<BrandAsset> {
  const asset = await brandAssetService.getById<BrandAsset>(req.params.id);
  if (String(asset.empresa_id) !== String(req.organizationId)) {
    throw new NotFoundError('Archivo de marca');
  }
  return asset;
}

/** Versión del archivo, o 404 si no existe o pertenece a otro archivo. */
async function versionDelAsset(
  assetId: string | number,
  versionId: string | number
): Promise<BrandAssetVersion> {
  let version: BrandAssetVersion;
  try {
    version = await brandAssetVersionService.getById<BrandAssetVersion>(versionId);
  } catch {
    throw new NotFoundError('Versión de archivo');
  }
  if (String(version.brand_asset_id) !== String(assetId)) {
    throw new NotFoundError('Versión de archivo');
  }
  return version;
}

/** Cuerpo de `BrandAssetDescarga` (el contrato que espera el frontend). */
async function payloadDescarga(version: BrandAssetVersion) {
  return {
    url: await storage.urlFirmada(version.ruta_storage),
    expira_en_segundos: storage.SEGUNDOS_URL_FIRMADA,
    nombre_archivo: version.nombre_archivo,
    mime_type: version.mime_type ?? null,
    tamano_bytes: version.tamano_bytes ?? null,
    numero: version.numero,
  };
}

// ── Subida multipart (memoria + límite de 10 MB) ─────────────────────────────
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

/** `DELETE /brand-assets/:id` — borra blobs, versiones y luego el archivo. */
const eliminarAsset: RequestHandler = async (req: Request, res: Response) => {
  try {
    const asset = await assetDeSesion(req);

    const versiones = await brandAssetVersionService.getAll<BrandAssetVersion>({
      where: { brand_asset_id: asset.brand_asset_id },
    });

    // Los blobs se borran antes que las filas. Mejor-esfuerzo: un blob ya
    // inexistente no debe impedir limpiar la base.
    if (versiones.length) {
      await storage
        .borrarArchivos(versiones.map((version) => version.ruta_storage))
        .catch((error) =>
          console.warn('[brand-kit] No se pudieron borrar blobs:', (error as Error).message)
        );
      for (const version of versiones) {
        await brandAssetVersionService.remove(version.brand_asset_version_id, audit(req));
      }
    }

    await brandAssetService.remove(asset.brand_asset_id, audit(req));
    res.json({ message: 'Archivo de marca eliminado correctamente' });
  } catch (error) {
    brandAssetController.sendError(res, error);
  }
};

// ── Rutas propias de storage (registradas sobre el mismo router) ─────────────
function registrarRutasStorage(router: Router): void {
  // GET /:id/versiones — historial completo, la versión más reciente primero.
  router.get('/:id/versiones', ...requireOrg, async (req: Request, res: Response) => {
    try {
      const asset = await assetDeSesion(req);
      const versiones = await brandAssetVersionService.getAll<BrandAssetVersion>({
        where: { brand_asset_id: asset.brand_asset_id },
        orderBy: 'numero',
        ascending: false,
      });
      res.json(brandAssetVersionResource.formatMany(versiones));
    } catch (error) {
      brandAssetController.sendError(res, error);
    }
  });

  // POST /:id/versiones — multipart con el campo `archivo` y `nota` opcional.
  router.post(
    '/:id/versiones',
    ...requireOrg,
    writeByMarketing,
    subidaMiddleware,
    async (req: Request, res: Response) => {
      try {
        const asset = await assetDeSesion(req);

        const file = req.file;
        if (!file) {
          throw new ValidationError('Adjunta un archivo en el campo "archivo".');
        }

        // Límite + tipo de archivo según la categoría del Brand Asset.
        const mime = storage.validarArchivo(
          { nombre: file.originalname, mime: file.mimetype, bytes: file.size },
          asset.categoria
        );
        const nombre = storage.nombreArchivoSeguro(file.originalname);

        // Número correlativo de versión (1, 2, 3…): se lee el máximo actual.
        const previas = await brandAssetVersionService.getAll<Pick<BrandAssetVersion, 'numero'>>({
          where: { brand_asset_id: asset.brand_asset_id },
          columns: ['numero'],
        });
        const numero = previas.reduce((max, version) => Math.max(max, version.numero), 0) + 1;
        const ruta = storage.rutaVersion(asset.empresa_id, asset.brand_asset_id, numero, nombre);

        await storage.subirArchivo(ruta, file.buffer, mime);

        let version: BrandAssetVersion;
        try {
          version = await brandAssetVersionService.create<BrandAssetVersion>(
            {
              brand_asset_id: asset.brand_asset_id,
              numero,
              nombre_archivo: nombre,
              ruta_storage: ruta,
              mime_type: mime,
              tamano_bytes: file.size,
              nota: normalizarNota(req.body?.nota),
              subido_por: req.localUsuarioId ?? null,
              empresa_id: asset.empresa_id,
            },
            audit(req)
          );
        } catch (error) {
          // No dejar un blob huérfano si la fila no pudo crearse.
          await storage.borrarArchivos([ruta]).catch(() => undefined);
          throw error;
        }

        // La versión recién subida pasa a ser la activa.
        await brandAssetService.update(
          asset.brand_asset_id,
          { version_activa_id: version.brand_asset_version_id },
          audit(req)
        );

        res.status(201).json(brandAssetVersionResource.format(version));
      } catch (error) {
        brandAssetController.sendError(res, error);
      }
    }
  );

  // GET /:id/descarga — URL firmada de la versión activa (5 minutos).
  router.get('/:id/descarga', ...requireOrg, async (req: Request, res: Response) => {
    try {
      const asset = await assetDeSesion(req);
      if (!asset.version_activa_id) {
        throw new HttpError(404, 'Este archivo aún no tiene versiones para descargar.');
      }
      const version = await versionDelAsset(asset.brand_asset_id, asset.version_activa_id);
      res.json(await payloadDescarga(version));
    } catch (error) {
      brandAssetController.sendError(res, error);
    }
  });

  // GET /:id/versiones/:vid/descarga — URL firmada de una versión puntual.
  router.get(
    '/:id/versiones/:vid/descarga',
    ...requireOrg,
    async (req: Request, res: Response) => {
      try {
        await assetDeSesion(req);
        const version = await versionDelAsset(req.params.id, req.params.vid);
        res.json(await payloadDescarga(version));
      } catch (error) {
        brandAssetController.sendError(res, error);
      }
    }
  );

  // POST /:id/versiones/:vid/restaurar — esa versión vuelve a ser la activa.
  router.post(
    '/:id/versiones/:vid/restaurar',
    ...requireOrg,
    writeByMarketing,
    async (req: Request, res: Response) => {
      try {
        const asset = await assetDeSesion(req);
        const version = await versionDelAsset(asset.brand_asset_id, req.params.vid);
        await brandAssetService.update(
          asset.brand_asset_id,
          { version_activa_id: version.brand_asset_version_id },
          audit(req)
        );
        const actualizado = await brandAssetService.getById<BrandAsset>(asset.brand_asset_id);
        res.json(brandAssetResource.format(actualizado));
      } catch (error) {
        brandAssetController.sendError(res, error);
      }
    }
  );

  // DELETE /:id/versiones/:vid — borra el blob y la fila; si era la activa,
  // activa la versión más reciente restante (o deja el archivo sin versión).
  router.delete(
    '/:id/versiones/:vid',
    ...requireOrg,
    writeByMarketing,
    async (req: Request, res: Response) => {
      try {
        const asset = await assetDeSesion(req);
        const version = await versionDelAsset(asset.brand_asset_id, req.params.vid);

        await storage.borrarArchivos([version.ruta_storage]);
        await brandAssetVersionService.remove(version.brand_asset_version_id, audit(req));

        if (String(asset.version_activa_id) === String(version.brand_asset_version_id)) {
          const restantes = await brandAssetVersionService.getAll<BrandAssetVersion>({
            where: { brand_asset_id: asset.brand_asset_id },
            orderBy: 'numero',
            ascending: false,
          });
          const siguiente = restantes[0] ?? null;
          await brandAssetService.update(
            asset.brand_asset_id,
            { version_activa_id: siguiente?.brand_asset_version_id ?? null },
            audit(req)
          );
        }

        res.json({ message: 'Versión eliminada correctamente' });
      } catch (error) {
        brandAssetController.sendError(res, error);
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
export const { router: brandAssetRouter } = createCrudRouter<BrandAsset>({
  table: 'brand_assets',
  primaryKey: 'brand_asset_id',
  joins: JOINS_ASSET,
  service: brandAssetService,
  controller: brandAssetController,
  request: brandAssetRequest,
  resource: brandAssetResource,
  entityName: 'Archivo de marca',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByMarketing, empresaEnEscritura],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
  handlers: { remove: eliminarAsset },
  extraRoutes: registrarRutasStorage,
});

export const { router: brandColorRouter } = createCrudRouter<BrandColor>({
  table: 'brand_colors',
  primaryKey: 'brand_color_id',
  joins: ['empresas(*)'],
  request: brandColorRequest,
  resource: brandColorResource,
  entityName: 'Color de marca',
  middlewares: [...requireOrg, filterByEmpresa],
  writeMiddlewares: [writeByMarketing, empresaEnEscritura],
  defaultGetAllOptions: { orderBy: 'creado_en', ascending: false },
  tenantScoped: true,
  tenantColumn: 'empresa_id',
});
