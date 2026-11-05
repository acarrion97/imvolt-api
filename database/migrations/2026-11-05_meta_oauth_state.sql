-- Estado OAuth de Meta de un solo uso, vinculado a la empresa que inició el flujo.
-- Requiere 2026-10-27_01_ai_connections.sql.

create table if not exists public.meta_oauth_states (
    state_hash  char(64) primary key,
    empresa_id  bigint not null references public.empresas (empresa_id) on delete cascade,
    expira_en   timestamptz not null,
    usado_en    timestamptz,
    creado_en   timestamptz not null default now()
);

create index if not exists idx_meta_oauth_states_expira
    on public.meta_oauth_states (expira_en);

alter table public.conexiones
    -- External Meta app-scoped ID, used only to process Meta data-deletion requests.
    add column if not exists meta_user_id varchar(100);

create index if not exists idx_conexiones_meta_user
    on public.conexiones (meta_user_id)
    where meta_user_id is not null;

alter table public.meta_oauth_states enable row level security;
revoke all on public.meta_oauth_states from anon, authenticated;

notify pgrst, 'reload schema';
