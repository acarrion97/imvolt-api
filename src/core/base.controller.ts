// core/base.controller.ts
// Capa de CONTROLADOR del núcleo MVC.
//
// BaseController orquesta el flujo completo de un CRUD:
//
//   Request (valida + payload) → Service (BD) → Resource (vista) → Response
//
// Maneja los códigos HTTP: 400 (validación), 404 (no encontrado), 500 (error).

import { Request, Response } from 'express';
import { BaseRequest } from './base.request';
import { BaseResource } from './base.resource';
import { BaseService } from './base.service';
import { HttpError } from './errors';

export interface BaseControllerConfig<T> {
  service: BaseService<T>;
  /** Si se provee, se valida el body de create/update y se usa como payload. */
  request?: BaseRequest<T>;
  /** Si se provee, se formatea la respuesta. Si no, se devuelve el registro crudo. */
  resource?: BaseResource<any, any>;
  /** Nombre usado en mensajes (ej. 'Categoría'). */
  entityName?: string;
}

export class BaseController<T = any> {
  protected readonly service: BaseService<T>;
  protected readonly request?: BaseRequest<T>;
  protected readonly resource?: BaseResource<any, any>;
  protected readonly entityName: string;

  constructor(config: BaseControllerConfig<T>) {
    this.service = config.service;
    this.request = config.request;
    this.resource = config.resource;
    this.entityName = config.entityName ?? 'Registro';
  }

  /** GET /  */
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.service.getAll();
      res.json(this.formatMany(rows));
    } catch (error) {
      this.sendError(res, error);
    }
  };

  /** GET /:id */
  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const row = await this.service.getById(req.params.id);
      res.json(this.format(row));
    } catch (error) {
      this.sendError(res, error);
    }
  };

  /** POST / */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = this.request ? this.request.validateCreate(req.body) : req.body;
      const row = await this.service.create(payload, req.userId);
      res.status(201).json(this.format(row));
    } catch (error) {
      this.sendError(res, error);
    }
  };

  /** PUT /:id */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = this.request ? this.request.validateUpdate(req.body) : req.body;
      const row = await this.service.update(req.params.id, payload, req.userId);
      res.json(this.format(row));
    } catch (error) {
      this.sendError(res, error);
    }
  };

  /** DELETE /:id */
  remove = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.remove(req.params.id, req.userId);
      res.json({ message: `${this.entityName} eliminado correctamente` });
    } catch (error) {
      this.sendError(res, error);
    }
  };

  /** Transforma una fila según el Resource, si está definido. */
  format(row: any): any {
    return this.resource ? this.resource.format(row) : row;
  }

  formatMany(rows: any[]): any {
    return this.resource ? this.resource.formatMany(rows) : rows;
  }

  /** Respuesta de error estandarizada. */
  sendError(res: Response, error: unknown): void {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ message: error.message, details: error.details });
      return;
    }
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    res.status(500).json({ message });
  }
}
