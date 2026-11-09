-- =============================================================================
-- Migración 0041 — retirar los créditos del catálogo de planes
-- =============================================================================

alter table public.planes
    drop column if exists creditos_mensuales;

delete from public.configuraciones_sistema
where clave = 'creditos_mensuales_por_defecto';
