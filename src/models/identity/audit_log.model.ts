// models/identity/audit_log.model.ts
// Bitácora de auditoría (tabla `audit_logs`). Es de SÓLO LECTURA desde el API:
// la escribe el núcleo (`services/audit.service.ts`) y solo se consulta.

import { BaseModel } from "../../core";
import { Empresa } from "./empresa.model";
import { UsuarioView } from "./usuario.model";

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REGISTER' | 'LOGIN';

export interface AuditLog extends BaseModel<AuditLog> {
    audit_log_id: number;
    /** Acción registrada. */
    accion: AuditAction;
    /** Tabla afectada (o `sesion` para los inicios de sesión). */
    tabla: string;
    /** Id del registro afectado; null en acciones sin registro concreto. */
    registro_id: string | null;
    /** UUID del usuario en Supabase Auth. */
    auth_user_id: string | null;
    /** Fila local en `usuarios`; null si el usuario ya no existe. */
    usuario_id: number | null;
    /** Empresa (tenant) a la que pertenece la acción. */
    empresa_id: number | null;
    /** Payload involucrado, con credenciales ya enmascaradas. */
    detalles: unknown;
}

/** MODELO DE VISUALIZACIÓN: la entrada con su usuario y su empresa. */
export interface AuditLogView extends AuditLog {
    /** Relación incrustada (FK → usuarios); null si el usuario fue borrado. */
    usuario: UsuarioView | null;
    /** Relación incrustada (FK → empresas); null si la empresa fue borrada. */
    empresa: Empresa | null;
}
