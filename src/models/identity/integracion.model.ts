// models/identity/integracion.model.ts
// Catálogo de proveedores integrables (tabla `integraciones` del diagrama).
// Es una tabla de apoyo SIN CRUD propio: se alimenta con la semilla del
// esquema y se lee incrustada en `empresas_integraciones`.

import { BaseModel } from "../../core";

export interface Integracion extends BaseModel<Integracion> {
    integracion_id: number;
    nombre: string;
    proveedor: string | null;
    descripcion: string | null;
    activa: boolean;
}
