-- =============================================================================
-- Migración 0032 — semilla de catálogos creativos
--
-- Fuente: partición de database/schema.sql (migración inicial del proyecto).
-- Idempotente: se puede ejecutar más de una vez sobre la misma base de datos.
-- Tipos de plantilla, plantillas, formatos y enfoques comerciales.
-- =============================================================================

-- Categorías de plantillas creativas.
insert into public.tipos_plantillas (nombre, descripcion) values
    ('terrenos', 'Plantillas para lotes, terrenos y lotizaciones'),
    ('vivienda', 'Plantillas para casas y departamentos residenciales'),
    ('comercial', 'Plantillas para oficinas, locales y proyectos de uso mixto')
on conflict do nothing;

-- Plantillas creativas (alineadas al prototipo IMVOLT).
insert into public.plantillas (nombre, descripcion, tipo_plantilla_id)
select v.nombre, v.descripcion, t.tipo_plantilla_id
from (values
    ('Vuelo aéreo cinematográfico', 'Introducción visual de una lotización desde la altura.', 'terrenos'),
    ('Presentación de lotes', 'Creativo que resalta ubicación, atributos verificables y llamada a la acción.', 'terrenos'),
    ('Fachada en movimiento', 'Travelling cinematográfico de fachada y acceso principal.', 'vivienda'),
    ('Carrusel de venta', 'Secuencia editorial para anuncios de una vivienda.', 'vivienda'),
    ('Render arquitectónico animado', 'Da movimiento a un render, señalando que es representación conceptual.', 'comercial'),
    ('Oferta de lanzamiento', 'Pieza de alto impacto con promoción validada por el propietario.', 'comercial')
) as v(nombre, descripcion, categoria)
join public.tipos_plantillas t on t.nombre = v.categoria
on conflict do nothing;

-- Formatos de salida.
insert into public.formatos (nombre, descripcion) values
    ('9:16 Reels', 'Vertical para Reels, TikTok y Stories'),
    ('4:5 Vertical', 'Feed vertical de Meta e Instagram'),
    ('1:1 Feed', 'Cuadrado para feed y carruseles'),
    ('16:9 Horizontal', 'YouTube, presentaciones y web')
on conflict do nothing;

-- Enfoques comerciales.
insert into public.enfoques_comerciales (nombre, descripcion) values
    ('Inversión', 'Plusvalía, ubicación y retorno verificable'),
    ('Primer hogar', 'Accesibilidad, planes de pago y vida de barrio'),
    ('Exclusividad', 'Diseño, privacidad y acabados premium'),
    ('Lanzamiento', 'Novedad del proyecto y oportunidad temprana')
on conflict do nothing;
