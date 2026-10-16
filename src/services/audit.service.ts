// services/audit.service.ts
// Bitácora de auditoría (`audit_logs`): quién hizo qué, sobre qué tabla y
// dentro de qué empresa (RF-09 / §15 del documento maestro).
//
// Tres garantías, en orden de importancia:
//   1. NUNCA rompe la operación de negocio: si el insert falla, la petición
//      responde igual (la auditoría es mejor-esfuerzo).
//   2. Nunca persiste credenciales: `mask` enmascara recursivamente los campos
//      sensibles (contraseñas, api_key, tokens…) antes de guardarlos.
//   3. No ensucia la consola: si la tabla no existe (esquema sin desplegar),
//      se avisa UNA vez y la auditoría queda deshabilitada en ese proceso.

import supabase from '../config/supabaseClient';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REGISTER' | 'LOGIN';

/** Contexto del autor de la acción (resuelto por los middlewares de sesión). */
export interface AuditContext {
  /** UUID del usuario en Supabase Auth. */
  authUserId?: string;
  /** Fila local del usuario en `usuarios` (si tiene cuenta en la plataforma). */
  usuarioId?: number;
  /** Empresa (tenant) activa; null en acciones globales como el login. */
  empresaId?: string | number | null;
}

/** Claves que jamás se persisten en claro dentro de `detalles`. */
const SENSITIVE_KEYS =
  /(password|contrasen|api_key|apikey|app_secret|access_token|refresh_token|token|secret|credential)/i;

/** Enmascara recursivamente los campos sensibles de un payload. */
function mask(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => mask(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      SENSITIVE_KEYS.test(key) && val ? '••••' : mask(val, depth + 1),
    ])
  );
}

/** Serializa los detalles a un tamaño razonable para jsonb. */
function toDetails(detalles: unknown): unknown {
  if (detalles === undefined) return null;
  const texto = JSON.stringify(mask(detalles));
  if (texto === undefined) return null;
  return texto.length > 10_000 ? { truncado: true, bytes: texto.length } : JSON.parse(texto);
}

let habilitado = true;

/**
 * Registra una acción en `audit_logs`. Mejor-esfuerzo: jamás lanza.
 *
 *   await logAudit('propiedades', 'DELETE', id, { antes }, req);
 */
export async function logAudit(
  tabla: string,
  accion: AuditAction,
  registroId: string | number | null | undefined,
  detalles: unknown,
  contexto: AuditContext = {}
): Promise<void> {
  if (!habilitado) return;

  try {
    const { error } = await supabase.from('audit_logs').insert([
      {
        accion,
        tabla,
        registro_id: registroId == null ? null : String(registroId),
        auth_user_id: contexto.authUserId ?? null,
        usuario_id: contexto.usuarioId ?? null,
        empresa_id: contexto.empresaId == null ? null : Number(contexto.empresaId),
        detalles: toDetails(detalles),
      },
    ]);

    if (!error) return;

    if (/does not exist|schema cache|relation/i.test(error.message)) {
      habilitado = false;
      console.warn(
        `[auditoría] La tabla 'audit_logs' no existe en la base: la auditoría queda ` +
          `DESHABILITADA en este proceso. Ejecuta database/schema.sql para activarla. ` +
          `(Detalle: ${error.message})`
      );
      return;
    }

    console.warn(`[auditoría] No se pudo registrar ${accion} sobre '${tabla}': ${error.message}`);
  } catch (error) {
    console.warn(
      `[auditoría] Error inesperado al registrar ${accion} sobre '${tabla}':`,
      error instanceof Error ? error.message : error
    );
  }
}

/** Comprueba si la auditoría sigue activa (útil en diagnósticos). */
export const auditoriaActiva = (): boolean => habilitado;

export const auditService = { logAudit, auditoriaActiva };
