-- =============================================================================
-- Migración 0036 — contador monotónico de versiones en brand_assets
-- =============================================================================
-- Corrige el reciclaje de números de versión del Brand Kit.
--
-- ANTES: `siguienteNumero()` calculaba max(numero de las filas VIVAS) + 1, y
--   `BaseService.remove()` hace un borrado FÍSICO. Al borrar la versión más
--   reciente y volver a subir, el máximo vivo retrocedía y el número se
--   reciclaba (p. ej. se repetía el 2). La restricción unique no se violaba,
--   pero la numeración dejaba de ser correlativa y `audit_logs` quedaba
--   ambiguo: dos brand_asset_version_id distintos con el mismo numero.
--
-- AHORA: `brand_assets.siguiente_numero` es un contador que solo avanza. Cada
--   subida lo incrementa; borrar una versión NO lo decrementa. Los números ya
--   usados no se reciclan jamás.
--
-- El UPDATE de backfill continúa la numeración de los archivos que ya tienen
-- versiones, para que no repita números emitidos antes de esta migración.
-- Idempotente: solo escribe cuando el contador va por detrás del máximo usado.

alter table public.brand_assets
    add column if not exists siguiente_numero integer not null default 0;

update public.brand_assets a
set siguiente_numero = coalesce(v.maximo, 0) + 1
from (
    select brand_asset_id, max(numero) as maximo
    from public.brand_asset_versions
    group by brand_asset_id
) v
where v.brand_asset_id = a.brand_asset_id
  and a.siguiente_numero < coalesce(v.maximo, 0) + 1;
