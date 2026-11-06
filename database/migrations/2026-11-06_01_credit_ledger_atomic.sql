-- Atomic ledger movements and explicit business credit amounts.
-- Run after 2026-10-27_03_credit_ledger.sql.

alter table public.generaciones
    add column if not exists idempotency_key varchar(120);

create unique index if not exists uq_generaciones_empresa_idempotency
    on public.generaciones (empresa_id, idempotency_key)
    where idempotency_key is not null;

alter table public.credit_transactions
    add column if not exists creditos integer;

update public.credit_transactions
set creditos = abs(monto)
where creditos is null;

alter table public.credit_transactions
    alter column creditos set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'credit_transactions_creditos_nonnegative'
          and conrelid = 'public.credit_transactions'::regclass
    ) then
        alter table public.credit_transactions
            add constraint credit_transactions_creditos_nonnegative check (creditos >= 0);
    end if;
end
$$;

create or replace function public.get_or_create_credit_wallet(p_organization_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_wallet public.credit_wallets%rowtype;
    v_created boolean := false;
begin
    insert into public.credit_wallets (organization_id, saldo, moneda)
    values (p_organization_id, 0, 'USD')
    on conflict (organization_id) do nothing
    returning * into v_wallet;
    v_created := found;

    if v_created then
        update public.credit_wallets
        set saldo = 25, updated_at = now()
        where wallet_id = v_wallet.wallet_id
        returning * into v_wallet;

        insert into public.credit_transactions (
            wallet_id, organization_id, tipo, monto, creditos, descripcion, idempotency_key
        ) values (
            v_wallet.wallet_id, p_organization_id, 'recarga', 25, 25,
            'Créditos de bienvenida IMVOLT', 'welcome:' || p_organization_id::text
        );
    else
        select * into v_wallet
        from public.credit_wallets
        where organization_id = p_organization_id;
    end if;

    return to_jsonb(v_wallet);
end;
$$;

create or replace function public.apply_credit_movement(
    p_organization_id bigint,
    p_tipo varchar,
    p_monto integer,
    p_creditos integer,
    p_generation_id bigint,
    p_descripcion text,
    p_idempotency_key varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_wallet public.credit_wallets%rowtype;
    v_transaction public.credit_transactions%rowtype;
    v_existing public.credit_transactions%rowtype;
    v_reservation public.credit_transactions%rowtype;
begin
    if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
        raise exception using errcode = 'P0001', message = 'CREDIT_IDEMPOTENCY_KEY_REQUIRED';
    end if;
    if p_tipo not in ('reserva', 'consumo', 'devolucion', 'recarga', 'ajuste')
       or p_creditos < 0 then
        raise exception using errcode = 'P0001', message = 'CREDIT_MOVEMENT_INVALID';
    end if;

    select * into v_wallet
    from public.credit_wallets
    where organization_id = p_organization_id
    for update;
    if not found then
        raise exception using errcode = 'P0001', message = 'CREDIT_WALLET_NOT_FOUND';
    end if;

    select * into v_existing
    from public.credit_transactions
    where idempotency_key = p_idempotency_key;
    if found then
        if v_existing.organization_id <> p_organization_id
           or v_existing.tipo <> p_tipo
           or v_existing.monto <> p_monto
           or v_existing.creditos <> p_creditos
           or v_existing.generation_id is distinct from p_generation_id then
            raise exception using errcode = 'P0001', message = 'CREDIT_IDEMPOTENCY_CONFLICT';
        end if;
        return jsonb_build_object(
            'wallet', to_jsonb(v_wallet),
            'transaction', to_jsonb(v_existing),
            'replayed', true
        );
    end if;

    if p_tipo in ('reserva', 'consumo', 'devolucion') then
        if p_generation_id is null then
            raise exception using errcode = 'P0001', message = 'CREDIT_GENERATION_REQUIRED';
        end if;
        select * into v_reservation
        from public.credit_transactions
        where generation_id = p_generation_id and tipo = 'reserva';

        if p_tipo = 'reserva' then
            if p_monto <> -p_creditos or found then
                raise exception using errcode = 'P0001', message = 'CREDIT_RESERVATION_CONFLICT';
            end if;
        else
            if not found
               or v_reservation.organization_id <> p_organization_id
               or v_reservation.creditos <> p_creditos then
                raise exception using errcode = 'P0001', message = 'CREDIT_RESERVATION_NOT_FOUND';
            end if;
            if exists (
                select 1 from public.credit_transactions
                where generation_id = p_generation_id and tipo in ('consumo', 'devolucion')
            ) then
                raise exception using errcode = 'P0001', message = 'CREDIT_RESERVATION_ALREADY_SETTLED';
            end if;
            if (p_tipo = 'consumo' and p_monto <> 0)
               or (p_tipo = 'devolucion' and p_monto <> p_creditos) then
                raise exception using errcode = 'P0001', message = 'CREDIT_MOVEMENT_INVALID';
            end if;
        end if;
    elsif p_tipo = 'recarga' and p_monto <> p_creditos then
        raise exception using errcode = 'P0001', message = 'CREDIT_MOVEMENT_INVALID';
    end if;

    if v_wallet.saldo + p_monto < 0 then
        raise exception using
            errcode = 'P0001',
            message = 'CREDIT_INSUFFICIENT',
            detail = json_build_object('saldo', v_wallet.saldo, 'requerido', abs(p_monto))::text;
    end if;

    update public.credit_wallets
    set saldo = saldo + p_monto, updated_at = now()
    where wallet_id = v_wallet.wallet_id
    returning * into v_wallet;

    insert into public.credit_transactions (
        wallet_id, organization_id, tipo, monto, creditos,
        generation_id, descripcion, idempotency_key
    ) values (
        v_wallet.wallet_id, p_organization_id, p_tipo, p_monto, p_creditos,
        p_generation_id, p_descripcion, p_idempotency_key
    )
    returning * into v_transaction;

    return jsonb_build_object(
        'wallet', to_jsonb(v_wallet),
        'transaction', to_jsonb(v_transaction),
        'replayed', false
    );
end;
$$;

revoke all on function public.apply_credit_movement(bigint, varchar, integer, integer, bigint, text, varchar)
    from public, anon, authenticated;
grant execute on function public.apply_credit_movement(bigint, varchar, integer, integer, bigint, text, varchar)
    to service_role;
revoke all on function public.get_or_create_credit_wallet(bigint) from public, anon, authenticated;
grant execute on function public.get_or_create_credit_wallet(bigint) to service_role;

notify pgrst, 'reload schema';
