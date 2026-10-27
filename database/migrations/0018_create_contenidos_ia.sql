-- =============================================================================
-- Migración 0018 — tabla contenidos_ia
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Pedidos de contenido generados para una propiedad.
-- =============================================================================

create table if not exists public.contenidos_ia (
    contenido_ia_id        bigserial primary key,
    propiedad_id           bigint not null references public.propiedades (propiedad_id) on delete cascade,
    plantilla_id           bigint not null references public.plantillas (plantilla_id),
    formato_id             bigint not null references public.formatos (formato_id),
    duracion               varchar(20) not null,
    enfoque_comercial_id   bigint not null references public.enfoques_comerciales (enfoque_comercial_id),
    url_imagen_referencia  varchar(500),
    estado                 varchar(20) not null default 'activo',
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now()
);

create index if not exists idx_contenidos_propiedad on public.contenidos_ia (propiedad_id);
create index if not exists idx_contenidos_plantilla on public.contenidos_ia (plantilla_id);
