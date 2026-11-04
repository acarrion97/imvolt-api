-- §09: catálogo vivo de modelos con el precio de lista de Higgsfield.
-- Requiere 2026-10-27_01_ai_connections.sql. Idempotente.
--
-- Unidades de precio tomadas del panel de Higgsfield:
--   imagen → USD por imagen; video → USD por segundo.
--
-- Paridad de créditos (1 crédito = USD 0.01):
--   imagen → creditos_cotizacion = ceil(precio_usd * 100)
--   video  → creditos_cotizacion = ceil(precio_usd * 5 * 100)   (bloque base de 5 s;
--            el recargo por duración sigue siendo ceil(duracion / 5) - 1 bloques)

alter table public.modelos_ia
    add column if not exists precio_usd numeric(10, 4),
    add column if not exists precio_unidad varchar(10)
        check (precio_unidad in ('imagen', 'segundo'));

comment on column public.modelos_ia.precio_usd is
    'Precio de lista del proveedor en USD (por imagen o por segundo, según precio_unidad).';
comment on column public.modelos_ia.precio_unidad is
    'Unidad del precio de lista: imagen | segundo.';

-- ── Filas existentes ────────────────────────────────────────────────────────
-- El modelo activo de imagen es el Soul Standard (mismo workflow del proveedor).
update public.modelos_ia
   set nombre = 'Soul Standard',
       precio_usd = 0.094,
       precio_unidad = 'imagen',
       creditos_cotizacion = 10,
       capacidades = capacidades || '{"precio_desde": true}'::jsonb
 where proveedor = 'higgsfield'
   and modelo_proveedor_id = 'higgsfield-ai/soul/v2/standard';

-- ── Imagen ──────────────────────────────────────────────────────────────────
insert into public.modelos_ia
    (proveedor, modelo_proveedor_id, nombre, tipo_media, capacidades,
     duracion_min_s, duracion_max_s, ratios, creditos_cotizacion, estado,
     precio_usd, precio_unidad)
values
    ('xai', 'xai/grok-imagine-2.0', 'Grok Imagine 2.0', 'image',
     '{"precio_desde": true, "edits": true}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16","2:3","3:2"]'::jsonb, 4, 'activo', 0.040, 'imagen'),
    ('higgsfield', 'higgsfield/marketing-studio-image', 'Marketing Studio Image', 'image',
     '{"precio_desde": true, "max_resolution": "4K"}'::jsonb, null, null,
     '["1:1","4:5","16:9","9:16"]'::jsonb, 2, 'activo', 0.016, 'imagen'),
    ('higgsfield', 'higgsfield/ai-influencer', 'AI Influencer', 'image',
     '{"precio_desde": false, "character_sheet": true, "modes": ["humano", "animal"]}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16"]'::jsonb, 5, 'activo', 0.050, 'imagen'),
    ('higgsfield', 'higgsfield/soul-2', 'Soul 2', 'image',
     '{"precio_desde": true, "estilos": ["retrato", "moda"]}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16","2:3","3:2"]'::jsonb, 1, 'activo', 0.003, 'imagen'),
    ('ideogram', 'ideogram/ideogram-4.0', 'Ideogram 4.0', 'image',
     '{"precio_desde": false, "texto_multilingue": true}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16","2:3","3:2"]'::jsonb, 3, 'activo', 0.030, 'imagen'),
    ('recraft', 'recraft/recraft-4.1', 'Recraft 4.1', 'image',
     '{"precio_desde": false, "paletas_custom": true}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16","2:3","3:2"]'::jsonb, 4, 'activo', 0.035, 'imagen'),
    ('higgsfield', 'higgsfield/ads-studio', 'Ads Studio', 'image',
     '{"precio_desde": true, "workflow": true}'::jsonb, null, null,
     '["1:1","4:5","16:9","9:16"]'::jsonb, 9, 'activo', 0.084, 'imagen'),
    ('alibaba', 'alibaba/qwen-image-3', 'Qwen Image 3', 'image',
     '{"precio_desde": true, "texto_multilingue": true}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16","2:3","3:2"]'::jsonb, 4, 'activo', 0.040, 'imagen'),
    ('alibaba', 'alibaba/z-image-turbo', 'Z-Image Turbo', 'image',
     '{"precio_desde": false, "fast": true}'::jsonb, null, null,
     '["1:1","4:5","3:4","16:9","9:16","2:3","3:2"]'::jsonb, 2, 'activo', 0.015, 'imagen'),
    ('higgsfield', 'higgsfield/product-shots', 'Product shots', 'image',
     '{"precio_desde": true, "workflow": true}'::jsonb, null, null,
     '["1:1","4:5","16:9","9:16"]'::jsonb, 2, 'activo', 0.016, 'imagen'),
    ('higgsfield', 'higgsfield/graphic-ads', 'Graphic ads', 'image',
     '{"precio_desde": true, "workflow": true}'::jsonb, null, null,
     '["1:1","4:5","16:9","9:16"]'::jsonb, 2, 'activo', 0.016, 'imagen'),
    ('higgsfield', 'higgsfield/marketplace-design', 'Marketplace design', 'image',
     '{"precio_desde": true, "workflow": true}'::jsonb, null, null,
     '["1:1","4:5","16:9","9:16"]'::jsonb, 2, 'activo', 0.016, 'imagen')
on conflict (proveedor, modelo_proveedor_id) do nothing;

-- ── Video (precio por segundo; créditos = bloque base de 5 s) ───────────────
insert into public.modelos_ia
    (proveedor, modelo_proveedor_id, nombre, tipo_media, capacidades,
     duracion_min_s, duracion_max_s, ratios, creditos_cotizacion, estado,
     precio_usd, precio_unidad)
values
    ('bytedance', 'bytedance/seedance-2.5', 'Seedance 2.5', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15,20,25,30]}'::jsonb, 5, 30,
     '["9:16","16:9","1:1"]'::jsonb, 103, 'activo', 0.206, 'segundo'),
    ('higgsfield', 'higgsfield/genjutsu-light', 'Genjutsu Light', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 25, 'activo', 0.050, 'segundo'),
    ('higgsfield', 'higgsfield/genjutsu', 'Genjutsu', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15], "swap": true}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 159, 'activo', 0.318, 'segundo'),
    ('kling', 'kling/kling-4.0', 'Kling 4.0', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 79, 'activo', 0.157, 'segundo'),
    ('kling', 'kling/kling-4.0-flash', 'Kling 4.0 Flash', 'video',
     '{"precio_desde": false, "duration_options": [5,10,15], "resolution": "720p"}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 47, 'activo', 0.094, 'segundo'),
    ('minimax', 'minimax/minimax-h3', 'MiniMax H3', 'video',
     '{"precio_desde": false, "duration_options": [5,10,15], "max_resolution": "2K"}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 65, 'activo', 0.130, 'segundo'),
    ('alibaba', 'alibaba/wan-3.0-prime', 'Wan 3.0 Prime', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 34, 'activo', 0.068, 'segundo'),
    ('bytedance', 'bytedance/seedance-2.0', 'Seedance 2.0', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15], "max_resolution": "4K"}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 71, 'activo', 0.141, 'segundo'),
    ('kling', 'kling/kling-3.0', 'Kling 3.0', 'video',
     '{"precio_desde": false, "duration_options": [5,10,15], "multi_shot": true}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 42, 'activo', 0.084, 'segundo'),
    ('alibaba', 'alibaba/happy-horse-1.0', 'Happy Horse 1.0', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 70, 'activo', 0.140, 'segundo'),
    ('pixverse', 'pixverse/pixverse-6', 'PixVerse 6', 'video',
     '{"precio_desde": false, "duration_options": [5,10,15], "audio": true, "descuento": "15%"}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 49, 'activo', 0.098, 'segundo'),
    ('kling', 'kling/kling-o3', 'Kling O3', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15], "multi_shot": true}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 42, 'activo', 0.084, 'segundo'),
    ('kling', 'kling/kling-2.6', 'Kling 2.6', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15], "audio": true}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 35, 'activo', 0.070, 'segundo'),
    ('kling', 'kling/kling-o1-omni', 'Kling O1 (Omni)', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 42, 'activo', 0.084, 'segundo'),
    ('alibaba', 'alibaba/wan-2.6', 'Wan 2.6', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15], "audio": true}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 50, 'activo', 0.100, 'segundo'),
    ('minimax', 'minimax/minimax-hailuo-2.3', 'MiniMax Hailuo 2.3', 'video',
     '{"precio_desde": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 24, 'activo', 0.047, 'segundo'),
    ('kling', 'kling/kling-2.5', 'Kling 2.5', 'video',
     '{"precio_desde": false, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 21, 'activo', 0.042, 'segundo'),
    ('higgsfield', 'higgsfield/cinema-studio-4.0', 'Cinema Studio', 'video',
     '{"precio_desde": true, "workflow": true, "duration_options": [5,10,15]}'::jsonb, 5, 15,
     '["9:16","16:9","1:1"]'::jsonb, 103, 'activo', 0.206, 'segundo')
on conflict (proveedor, modelo_proveedor_id) do nothing;

notify pgrst, 'reload schema';
