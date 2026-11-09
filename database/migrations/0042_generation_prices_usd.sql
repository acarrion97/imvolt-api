-- =============================================================================
-- Migración 0042 — registrar el precio en USD de cada generación
-- =============================================================================

alter table public.generaciones
    add column if not exists precio_usd numeric(10, 4);

update public.generaciones as generation
set precio_usd = round(
    model.precio_usd * case
        when model.tipo_media = 'video'
            then coalesce(
                case
                    when generation.parametros ->> 'duration' ~ '^[0-9]+([.][0-9]+)?$'
                        then (generation.parametros ->> 'duration')::numeric
                end,
                model.duracion_min_s,
                5
            )
        else 1
    end,
    4
)
from public.modelos_ia as model
where generation.modelo_id = model.modelo_id
  and generation.precio_usd is null
  and model.precio_usd is not null
  and model.precio_unidad = case
      when model.tipo_media = 'video' then 'segundo'
      else 'imagen'
  end;

comment on column public.generaciones.precio_usd is
    'Precio cotizado para esta generación en USD, sin impuestos. NULL indica que no se registró precio.';

create or replace view public.generation_jobs as
select
    generacion_id as generation_id,
    empresa_id as organization_id,
    propiedad_id as property_id,
    plantilla_id as template_id,
    modelo_id as model_id,
    modo,
    prompt,
    parametros,
    estado as status,
    idempotency_key,
    creditos_costo as credits_cost,
    peticion_proveedor_id as provider_request_id,
    error_mensaje as error_message,
    creado_en as created_at,
    actualizado_en as updated_at,
    precio_usd as price_usd
from public.generaciones;

notify pgrst, 'reload schema';
