export interface BaseModel<T> {
    estado: 'activo' | 'inactivo';
    creado_en: Date | null | string;
}