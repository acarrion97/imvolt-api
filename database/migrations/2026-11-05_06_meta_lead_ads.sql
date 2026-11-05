-- Persist metadata required to publish complete Meta lead ads from generated media.
-- Safe to apply more than once.

alter table public.campanias_publicitarias
    add column if not exists meta_page_id text,
    add column if not exists meta_page_name varchar(120),
    add column if not exists target_location_key text,
    add column if not exists target_location_name varchar(160),
    add column if not exists target_location_country_code varchar(2),
    add column if not exists privacy_policy_url text,
    add column if not exists media_type varchar(10),
    add column if not exists meta_adset_id text,
    add column if not exists meta_adcreative_id text,
    add column if not exists meta_ad_id text,
    add column if not exists meta_lead_form_id text;

alter table public.conexiones
    add column if not exists meta_currency varchar(3);

alter table public.campanias_publicitarias
    drop constraint if exists campanias_media_type_check;

alter table public.campanias_publicitarias
    add constraint campanias_media_type_check
    check (media_type is null or media_type in ('image', 'video'));

create unique index if not exists uq_campanias_meta_ad
    on public.campanias_publicitarias (meta_ad_id)
    where meta_ad_id is not null;

notify pgrst, 'reload schema';
