-- Publicación de campañas en Meta (rama claude/sharp-bohr-6p873w).
-- EJECUTAR ANTES de desplegar: el endpoint POST /campanias-publicitarias/:id/publicar
-- lee y escribe estas columnas. Idempotente: se puede ejecutar más de una vez.

alter table public.campanias_publicitarias
    add column if not exists meta_campaign_id varchar(40),
    add column if not exists meta_estado      varchar(20),
    add column if not exists publicada_en     timestamptz;

-- meta_estado: null (borrador local) → 'publicando' (reserva anti doble clic)
--              → 'published_paused' (creada en Meta, siempre PAUSED).
alter table public.campanias_publicitarias
    drop constraint if exists campanias_meta_estado_chk;
alter table public.campanias_publicitarias
    add constraint campanias_meta_estado_chk
    check (meta_estado is null or meta_estado in ('publicando', 'published_paused'));

create unique index if not exists uq_campanias_meta_campaign
    on public.campanias_publicitarias (meta_campaign_id)
    where meta_campaign_id is not null;
