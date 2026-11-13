-- Temporary Meta OAuth authorizations that do not include ad permissions.
-- These tokens are deliberately kept separate from `conexiones`, so they can
-- never be selected as an ad account or used to create/sync ads.
create table if not exists public.meta_oauth_authorizations (
    authorization_id bigserial primary key,
    empresa_id bigint not null references public.empresas (empresa_id) on delete cascade,
    meta_user_id varchar(100) not null,
    permisos jsonb not null default '{}'::jsonb,
    access_token_enc text not null,
    token_expira_en timestamptz,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (empresa_id, meta_user_id)
);

create index if not exists idx_meta_oauth_authorizations_user
    on public.meta_oauth_authorizations (meta_user_id);

alter table public.meta_oauth_authorizations enable row level security;
revoke all on public.meta_oauth_authorizations from anon, authenticated;

notify pgrst, 'reload schema';
