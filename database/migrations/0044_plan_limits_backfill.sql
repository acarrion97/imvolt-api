-- =============================================================================
-- Migración 0044 — repara el backfill de límites de uso
-- =============================================================================
-- La 0043 creó las columnas pero su backfill dejó todos los límites en NULL:
-- el patrón se aplicaba sobre la representación serializada del array y
-- `videos\b` no cubre "1 video IA". Repite la extracción de forma robusta:
--   1. recorre CADA beneficio con jsonb_array_elements_text (sin parsear el
--      array serializado),
--   2. ancla el patrón al inicio de la cadena,
--   3. usa `[0-9]` en lugar de `\d` para no depender del escapado.
--
-- Idempotente: solo rellena lo que sigue en NULL, nunca pisa un límite ya
-- configurado a mano. Ejecutar y revisar el SELECT final.

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

-- Verificación: AGENT/BUSINESS/PRIME deben salir con los cuatro límites
-- completos. Un NULL ahí significa que ese beneficio no está declarado.
select nombre,
       limite_usuarios,
       limite_proyectos,
       limite_imagenes_ia,
       limite_videos_ia,
       limite_campanias_meta,
       caracteristicas
from public.planes
order by precio_mensual;
