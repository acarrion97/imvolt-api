-- Metadatos operativos del proveedor de estrategias (sin prompt ni credenciales).
alter table public.estrategias_comerciales
    add column if not exists proveedor varchar(40),
    add column if not exists modelo_proveedor varchar(120),
    add column if not exists estado_proveedor varchar(20),
    add column if not exists duracion_proveedor_ms integer,
    add column if not exists costo_estimado_usd numeric(12, 8);

alter table public.estrategias_comerciales
    add constraint estrategias_duracion_no_negativa
        check (duracion_proveedor_ms is null or duracion_proveedor_ms >= 0),
    add constraint estrategias_costo_no_negativo
        check (costo_estimado_usd is null or costo_estimado_usd >= 0);
