-- Generación TEMPORAL de imágenes con OpenRouter.
--
-- Agrega al catálogo vivo un modelo de imagen cuyo `proveedor = 'openrouter'`.
-- El controlador de /api/v1/creative/generations detecta ese proveedor y usa
-- OpenRouter en lugar de Higgsfield.
--
-- Requiere 2026-11-04_modelos_ia_catalogo_usd.sql (columnas precio_usd y
-- precio_unidad). Idempotente.
--
-- Nota: OpenRouter exige al menos USD 1.00 de saldo para devolver imágenes.
-- Si la clave no tiene saldo, el servicio usa un PNG de marca local cuando
-- OPENROUTER_IMAGE_FALLBACK=true (valor por defecto).

insert into public.modelos_ia
    (proveedor, modelo_proveedor_id, nombre, tipo_media, capacidades,
     duracion_min_s, duracion_max_s, ratios, creditos_cotizacion, estado,
     precio_usd, precio_unidad)
values
    ('openrouter', 'google/gemini-3.1-flash-lite-image',
     'OpenRouter · Nano Banana 2 Lite', 'image',
     '{"temporary": true, "provider": "openrouter", "image_generation": true}'::jsonb,
     null, null, '["1:1","4:5","16:9","9:16"]'::jsonb, 1, 'activo',
     0.0001, 'imagen')
on conflict (proveedor, modelo_proveedor_id) do update
   set nombre = excluded.nombre,
       estado = 'activo',
       capacidades = excluded.capacidades,
       ratios = excluded.ratios,
       precio_usd = excluded.precio_usd,
       precio_unidad = excluded.precio_unidad;

comment on column public.modelos_ia.proveedor is
    'Proveedor del modelo. En modo temporal admite "openrouter" para imágenes.';

notify pgrst, 'reload schema';
