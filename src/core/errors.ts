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

/**
 * Cuerpo/estado de respuesta para cualquier error capturado.
 *
 * Los errores 4xx (validación, permisos, no encontrado) son del cliente y se
 * devuelven tal cual. Todo lo demás (errores de Supabase/PostgREST, excepciones
 * inesperadas, 5xx) puede contener nombres de tablas, columnas o
 * detalles de infraestructura: se registra SOLO en el servidor y el cliente
 * recibe un mensaje genérico.
 */
export function errorResponse(error: unknown): { status: number; body: { message: string; details?: unknown } } {
  if (error instanceof HttpError && error.statusCode < 500) {
    return { status: error.statusCode, body: { message: error.message, details: error.details } };
  }
  console.error('[error]', error instanceof Error ? `${error.name}: ${error.message}` : 'error desconocido');
  return { status: 500, body: { message: 'Error interno del servidor' } };
}
