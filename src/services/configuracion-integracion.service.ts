import { BaseService } from '../core';
import { AuditContext } from './audit.service';
import { encryptIntegrationSecret } from './integration-credentials.crypto';

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

  override create<U = unknown>(payload: Partial<U>, audit?: AuditContext): Promise<U> {
    return super.create(this.cifrarSecreto(payload), audit);
  }

  override update<U = unknown>(
    id: string | number,
    payload: Partial<U>,
    audit?: AuditContext,
  ): Promise<U> {
    return super.update(id, this.cifrarSecreto(payload), audit);
  }

  private cifrarSecreto<U>(payload: Partial<U>): Partial<U> {
    if (!payload || typeof payload !== 'object') return payload;
    const values = payload as Record<string, unknown>;
    if (typeof values.app_secret !== 'string' || !values.app_secret) return payload;

    return Object.assign({}, payload, {
      app_secret: encryptIntegrationSecret(values.app_secret),
    });
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
