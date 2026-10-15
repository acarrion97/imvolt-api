// core/base.request.ts
// Capa de VALIDACIÓN y PAYLOAD de la arquitectura MVC.
//
// Un Request cumple dos funciones:
//   1. Validar los datos de entrada con Joi (devuelve 400 con detalles si falla).
//   2. Devolver el "payload" limpio (solo los campos del esquema, con los tipos
//      convertidos y valores por defecto aplicados) listo para enviar a la BD.
//
// El Request NO conoce el modelo principal: el payload es un objeto plano.

import Joi from 'joi';
import { FieldError, ValidationError } from './errors';

export interface RequestSchemas {
  /** Esquema para CREAR registros (campos requeridos aquí). */
  create: Joi.ObjectSchema;
  /** Esquema para ACTUALIZAR registros (normalmente todo opcional). */
  update?: Joi.ObjectSchema;
}

export class BaseRequest<T = any> {
  constructor(private readonly schemas: RequestSchemas) {}

  /** Valida el body de creación y devuelve el payload listo para la BD. */
  validateCreate(payload: unknown): T {
    return this.run(this.schemas.create, payload);
  }

  /** Valida el body de actualización y devuelve el payload parcial listo para la BD. */
  validateUpdate(payload: unknown): Partial<T> {
    return this.run(this.schemas.update ?? this.schemas.create, payload);
  }

  private run(schema: Joi.ObjectSchema, payload: unknown): any {
    const { error, value } = schema.validate(payload ?? {}, {
      abortEarly: false,      // reportar todos los errores, no solo el primero
      stripUnknown: true,     // el payload solo llevará columnas definidas en el esquema
    });

    if (error) {
      const details: FieldError[] = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      throw new ValidationError('Datos de entrada inválidos', details);
    }

    return value;
  }
}
