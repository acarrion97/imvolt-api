-- =============================================================================
-- Migración 0037 — catálogo global de planes
-- =============================================================================

create table if not exists public.planes (
    plan_id             bigserial primary key,
    nombre              varchar(60) not null unique,
    descripcion         varchar(300) not null default '',
    precio_mensual      numeric(10, 2) not null default 0 check (precio_mensual >= 0),
    limite_usuarios     integer not null default 1 check (limite_usuarios >= 1),
    caracteristicas     jsonb not null default '[]'::jsonb,
    estado              varchar(20) not null default 'activo' check (estado in ('activo', 'inactivo')),
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now()
);

insert into public.planes (nombre, descripcion, precio_mensual, limite_usuarios, caracteristicas)
values
    ('AGENT', 'Para profesionales que gestionan un proyecto inmobiliario.', 39, 1, '["1 proyecto", "1 video IA de 10 s", "20 imágenes IA", "2 campañas Meta"]'::jsonb),
    ('BUSINESS', 'Para equipos que gestionan varios proyectos y campañas.', 89, 5, '["5 proyectos", "2 videos IA de 10 s", "60 imágenes IA", "10 campañas Meta"]'::jsonb),
    ('PRIME', 'Para equipos con mayor volumen de contenido y campañas.', 149, 15, '["10 proyectos", "3 videos IA de 10 s", "120 imágenes IA", "20 campañas Meta"]'::jsonb)
on conflict (nombre) do nothing;

alter table public.planes enable row level security;
revoke all on public.planes from anon, authenticated;
