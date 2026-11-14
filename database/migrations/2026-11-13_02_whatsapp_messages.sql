create table if not exists public.whatsapp_messages (
    message_id           bigserial primary key,
    empresa_id           bigint not null references public.empresas (empresa_id) on delete cascade,
    meta_message_id      varchar(180) not null,
    phone_number_id      varchar(100),
    sender_phone         varchar(30) not null,
    sender_name          varchar(160),
    message_type         varchar(40) not null,
    message_text         text,
    meta_timestamp        timestamptz,
    payload              jsonb not null default '{}'::jsonb,
    recibido_en          timestamptz not null default now(),
    unique (empresa_id, meta_message_id)
);

create index if not exists idx_whatsapp_messages_empresa_recibido
    on public.whatsapp_messages (empresa_id, recibido_en desc);

alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from anon, authenticated;

notify pgrst, 'reload schema';
