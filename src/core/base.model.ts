export interface BaseModel<T, E extends string = 'activo' | 'inactivo'> {
    estado: E;
    creado_en: Date | null | string;
    actualizado_en: Date | null | string;
}