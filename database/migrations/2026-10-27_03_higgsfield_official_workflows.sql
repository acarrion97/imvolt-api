-- Align the active catalog with Higgsfield's documented production workflows.
-- Existing generations keep their model_id foreign keys.

update public.modelos_ia
set modelo_proveedor_id = 'higgsfield-ai/soul/v2/standard',
    nombre = 'SOUL V2',
    capacidades = '{"resolution":["720p","1080p"]}'::jsonb,
    duracion_min_s = null,
    duracion_max_s = null,
    ratios = '["1:1","4:3","3:4","16:9","9:16","2:3","3:2"]'::jsonb
where proveedor = 'higgsfield'
  and modelo_proveedor_id = 'higgsfield/soul-4-image';

update public.modelos_ia
set modelo_proveedor_id = 'kling-video/v2.6/pro/text-to-video',
    nombre = 'Kling 2.6 Pro',
    capacidades = '{"sound":["on","off"],"duration_options":[5,10]}'::jsonb,
    duracion_min_s = 5,
    duracion_max_s = 10,
    ratios = '["9:16","16:9","1:1"]'::jsonb
where proveedor = 'higgsfield'
  and modelo_proveedor_id = 'higgsfield/veo3-video';
