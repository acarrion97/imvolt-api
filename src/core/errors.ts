// core/errors.ts
// Errores HTTP estandarizados que el núcleo MVC usa para responder correctamente.

export interface FieldError {
  field: string;
  message: string;
}

/** Error genérico con código HTTP asociado. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Error de validación de un Request (400). */
export class ValidationError extends HttpError {
  constructor(message = 'Datos de entrada inválidos', details?: FieldError[]) {
    super(400, message, details);
  }
}

/** Recurso no encontrado en BD (404). */
export class NotFoundError extends HttpError {
  constructor(entity = 'Registro') {
    super(404, `${entity} no encontrado`);
  }
}
