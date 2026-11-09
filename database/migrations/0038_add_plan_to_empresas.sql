-- =============================================================================
-- Migración 0038 — asignación de plan por empresa
-- =============================================================================

alter table public.empresas
    add column if not exists plan_id bigint references public.planes (plan_id) on delete restrict;

create index if not exists idx_empresas_plan on public.empresas (plan_id);

update public.empresas
set plan_id = (select plan_id from public.planes where nombre = 'AGENT')
where plan_id is null;
