-- =============================================================================
-- Migración 0043 — límites de uso por plan
-- =============================================================================
-- Los "beneficios" comerciales de cada plan dejan de ser texto libre en
-- `caracteristicas` y pasan a ser restricciones numéricas que la API valida
-- antes de crear proyectos, generaciones IA (imágenes / videos), campañas Meta
-- y miembros del equipo.
--
-- NULL = sin límite (plan sin esa restricción). El backfill extrae los valores
-- del texto histórico; los planes nuevos se dan de alta con los campos directos.

alter table public.planes
    add column if not exists limite_proyectos integer
        constraint chk_limite_proyectos check (limite_proyectos is null or limite_proyectos > 0),
    add column if not exists limite_imagenes_ia integer
        constraint chk_limite_imagenes_ia check (limite_imagenes_ia is null or limite_imagenes_ia > 0),
    add column if not exists limite_videos_ia integer
        constraint chk_limite_videos_ia check (limite_videos_ia is null or limite_videos_ia > 0),
    add column if not exists limite_campanias_meta integer
        constraint chk_limite_campanias_meta check (limite_campanias_meta is null or limite_campanias_meta > 0);

comment on column public.planes.limite_proyectos is 'Máximo de proyectos activos de la empresa. NULL = sin límite.';
comment on column public.planes.limite_imagenes_ia is 'Máximo de generaciones de imagen acumuladas. NULL = sin límite.';
comment on column public.planes.limite_videos_ia is 'Máximo de generaciones de video acumuladas. NULL = sin límite.';
comment on column public.planes.limite_campanias_meta is 'Máximo de campañas Meta acumuladas. NULL = sin límite.';

-- Backfill desde el texto de `caracteristicas` ("10 proyectos",
-- "120 imágenes IA", "3 videos IA de 10 s", "20 campañas Meta").
-- Se recorre CADA beneficio con jsonb_array_elements_text y se ancla el
-- patrón al inicio: parsear el array serializado depende de las comillas de
-- la representación y no matcheaba "1 video IA" con `videos\b`.
update public.planes as p
set limite_proyectos = coalesce(p.limite_proyectos, (
        select max((regexp_match(b, '^([0-9]+)[[:space:]]*proyectos?', 'i'))[1]::integer)
        from jsonb_array_elements_text(p.caracteristicas) as b
    )),
    limite_imagenes_ia = coalesce(p.limite_imagenes_ia, (
        select max((regexp_match(b, '^([0-9]+)[[:space:]]*im[aá]genes', 'i'))[1]::integer)
        from jsonb_array_elements_text(p.caracteristicas) as b
    )),
    limite_videos_ia = coalesce(p.limite_videos_ia, (
        select max((regexp_match(b, '^([0-9]+)[[:space:]]*videos?', 'i'))[1]::integer)
        from jsonb_array_elements_text(p.caracteristicas) as b
    )),
    limite_campanias_meta = coalesce(p.limite_campanias_meta, (
        select max((regexp_match(b, '^([0-9]+)[[:space:]]*campa[nñ]as', 'i'))[1]::integer)
        from jsonb_array_elements_text(p.caracteristicas) as b
    ))
where p.caracteristicas is not null;

-- Toda empresa debe tener plan asignado: los límites se resuelven desde él.
-- Las creadas antes de que existiera el lookup correcto en el registro pueden
-- haber quedado sin plan (0040 renombró 'Esencial' → 'AGENT').
update public.empresas
set plan_id = (select plan_id from public.planes where nombre = 'AGENT' and estado = 'activo')
where plan_id is null
  and exists (select 1 from public.planes where nombre = 'AGENT');

create index if not exists idx_planes_estado on public.planes (estado);
