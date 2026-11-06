-- =============================================================================
-- Migración 0037 — catálogo global de planes
-- =============================================================================

create table if not exists public.planes (
    plan_id             bigserial primary key,
    nombre              varchar(60) not null unique,
    descripcion         varchar(300) not null default '',
    precio_mensual      numeric(10, 2) not null default 0 check (precio_mensual >= 0),
    limite_usuarios     integer not null default 1 check (limite_usuarios >= 1),
    creditos_mensuales  integer not null default 0 check (creditos_mensuales >= 0),
    caracteristicas     jsonb not null default '[]'::jsonb,
    estado              varchar(20) not null default 'activo' check (estado in ('activo', 'inactivo')),
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now()
);

insert into public.planes (nombre, descripcion, precio_mensual, limite_usuarios, creditos_mensuales, caracteristicas)
values
    ('Esencial', 'Para equipos que empiezan a crecer.', 0, 1, 50, '["50 créditos mensuales", "1 usuario"]'::jsonb),
    ('Crecimiento', 'Herramientas para equipos inmobiliarios en expansión.', 49, 5, 500, '["500 créditos mensuales", "Hasta 5 usuarios", "Campañas y analítica"]'::jsonb),
    ('Corporativo', 'Capacidad y colaboración para equipos de alto volumen.', 149, 25, 2000, '["2.000 créditos mensuales", "Hasta 25 usuarios", "Soporte prioritario"]'::jsonb)
on conflict (nombre) do nothing;

alter table public.planes enable row level security;
revoke all on public.planes from anon, authenticated;
