-- =============================================================================
-- Migración 0020 — tabla campanias_publicitarias
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Campañas ligadas a una propiedad y su objetivo.
-- =============================================================================

create table if not exists public.campanias_publicitarias (
    campania_publicitaria_id bigserial primary key,
    propiedad_id             bigint not null references public.propiedades (propiedad_id) on delete cascade,
    objetivo_publicidad_id   bigint not null references public.objetivo_publicidad (objetivo_publicidad_id),
    presupuesto_diario       numeric(12, 2) not null,
    duracion_dias            numeric(8, 2) not null,
    zona_referencia          varchar(50) not null,
    copy_anuncio             text not null,
    estado                   varchar(20) not null default 'activo',
    creado_en                timestamptz not null default now(),
    actualizado_en           timestamptz not null default now()
);

create index if not exists idx_campanias_propiedad on public.campanias_publicitarias (propiedad_id);
create index if not exists idx_campanias_objetivo  on public.campanias_publicitarias (objetivo_publicidad_id);
