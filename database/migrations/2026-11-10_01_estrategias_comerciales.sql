-- Historial auditable de estrategias generadas para propiedades.
create table if not exists public.estrategias_comerciales (
    estrategia_id bigserial primary key,
    propiedad_id bigint not null references public.propiedades (propiedad_id) on delete restrict,
    empresa_id bigint not null references public.empresas (empresa_id) on delete restrict,
    usuario_id bigint references public.usuarios (usuario_id) on delete set null,
    auth_user_id varchar(36),
    objetivo varchar(20) not null check (objetivo in ('visitas', 'trafico', 'mensajes', 'formularios', 'branding')),
    presupuesto numeric(12,2) not null check (presupuesto >= 1 and presupuesto <= 100000),
    publico_objetivo varchar(500) not null check (char_length(trim(publico_objetivo)) between 2 and 500),
    generador_version varchar(80) not null,
    resultado jsonb not null,
    creado_en timestamptz not null default now()
);

create index if not exists idx_estrategias_empresa_fecha
    on public.estrategias_comerciales (empresa_id, creado_en desc);
create index if not exists idx_estrategias_propiedad_fecha
    on public.estrategias_comerciales (propiedad_id, creado_en desc);

alter table public.estrategias_comerciales enable row level security;
