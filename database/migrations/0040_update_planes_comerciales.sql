-- =============================================================================
-- Migración 0040 — planes comerciales de la presentación 2026
-- =============================================================================

update public.planes
set nombre = 'AGENT',
    descripcion = 'Para profesionales que gestionan un proyecto inmobiliario.',
    precio_mensual = 39,
    limite_usuarios = 1,
    caracteristicas = '["1 proyecto", "1 video IA de 10 s", "20 imágenes IA", "2 campañas Meta"]'::jsonb,
    actualizado_en = now()
where nombre = 'Esencial';

update public.planes
set nombre = 'BUSINESS',
    descripcion = 'Para equipos que gestionan varios proyectos y campañas.',
    precio_mensual = 89,
    limite_usuarios = 5,
    caracteristicas = '["5 proyectos", "2 videos IA de 10 s", "60 imágenes IA", "10 campañas Meta"]'::jsonb,
    actualizado_en = now()
where nombre = 'Crecimiento';

update public.planes
set nombre = 'PRIME',
    descripcion = 'Para equipos con mayor volumen de contenido y campañas.',
    precio_mensual = 149,
    limite_usuarios = 15,
    caracteristicas = '["10 proyectos", "3 videos IA de 10 s", "120 imágenes IA", "20 campañas Meta"]'::jsonb,
    actualizado_en = now()
where nombre = 'Corporativo';
