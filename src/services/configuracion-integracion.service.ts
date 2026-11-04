import { BaseService } from '../core';
import { AuditContext } from './audit.service';

const CAMPOS_SECRETOS = new Set(['api_key', 'app_secret', 'access_token']);

function ocultarCredenciales(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ocultarCredenciales);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      CAMPOS_SECRETOS.has(key) ? (item ? '••••' : item) : ocultarCredenciales(item),
    ]),
  );
}

/** Avoids copying provider secrets into audit_logs on create, update, or delete. */
export class ConfiguracionIntegracionService extends BaseService {
  constructor() {
    super('configuraciones_integraciones', 'configuracion_integracion_id');
  }

  protected override async auditar(
    accion: 'CREATE' | 'UPDATE' | 'DELETE',
    registroId: string | number | null | undefined,
    detalles: unknown,
    audit?: AuditContext,
  ): Promise<void> {
    await super.auditar(accion, registroId, ocultarCredenciales(detalles), audit);
  }
}
