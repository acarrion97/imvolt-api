-- =============================================================================
-- Migración 0029 — RLS denegado por defecto
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- El API accede con la service role key (bypass de RLS) y aplica autenticación,
-- RBAC y acote por empresa. Desde el navegador no hay acceso directo:
-- sin políticas permisivas, ni anon ni authenticated pueden leer estas tablas.
-- =============================================================================

do $$
declare
    tabla text;
begin
    foreach tabla in array array[
        'empresas', 'usuarios', 'roles', 'permisos', 'roles_usuarios',
        'roles_permisos', 'hitos_lanzamientos', 'empresas_hitos',
        'configuraciones_integraciones', 'integraciones', 'empresas_integraciones',
        'tipos_propiedades', 'propiedades', 'tipos_plantillas', 'plantillas',
        'formatos', 'enfoques_comerciales', 'contenidos_ia',
        'objetivo_publicidad', 'campanias_publicitarias', 'contactos', 'audit_logs',
        'brand_assets', 'brand_asset_versions', 'brand_colors'
    ]
    loop
        execute format('alter table public.%I enable row level security', tabla);
        execute format('revoke all on public.%I from anon, authenticated', tabla);
    end loop;
end $$;
