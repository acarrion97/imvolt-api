insert into public.integraciones (nombre, proveedor, descripcion)
select
    'Lotes al Mando',
    'Lotes al Mando',
    'Consulta de proyectos y lotes del inventario de Lotes al Mando'
where not exists (
    select 1
    from public.integraciones
    where nombre = 'Lotes al Mando'
);
