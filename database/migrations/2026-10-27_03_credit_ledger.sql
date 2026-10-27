-- Documento Maestro §16: wallet y ledger de créditos de generación.
-- Requiere database/schema.sql y la migración 01 (generaciones). Idempotente.

create table if not exists public.credit_wallets (
    wallet_id       uuid primary key default gen_random_uuid(),
    organization_id bigint not null references public.empresas (empresa_id) on delete cascade,
    saldo           integer not null default 0,
    moneda          varchar(3) not null default 'USD',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create unique index if not exists uq_credit_wallets_empresa
    on public.credit_wallets (organization_id);

create table if not exists public.credit_transactions (
    transaction_id  bigserial primary key,
    wallet_id       uuid not null references public.credit_wallets (wallet_id) on delete cascade,
    organization_id bigint not null references public.empresas (empresa_id) on delete cascade,
    tipo            varchar(20) not null
        check (tipo in ('reserva', 'consumo', 'devolucion', 'recarga', 'ajuste')),
    monto           integer not null,
    generation_id   bigint references public.generaciones (generacion_id) on delete set null,
    descripcion     text,
    idempotency_key varchar(120),
    created_at      timestamptz not null default now()
);

create index if not exists idx_credit_transactions_empresa
    on public.credit_transactions (organization_id, created_at desc);
create index if not exists idx_credit_transactions_wallet
    on public.credit_transactions (wallet_id);
create unique index if not exists uq_credit_transactions_idempotency
    on public.credit_transactions (idempotency_key)
    where idempotency_key is not null;

alter table public.credit_wallets enable row level security;
revoke all on public.credit_wallets from anon, authenticated;
alter table public.credit_transactions enable row level security;
revoke all on public.credit_transactions from anon, authenticated;

notify pgrst, 'reload schema';
