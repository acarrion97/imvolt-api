-- =============================================================================
-- Migración 0039 — configuraciones globales de la plataforma
-- =============================================================================

create table if not exists public.configuraciones_sistema (
    configuracion_sistema_id bigserial primary key,
    clave                     varchar(60) not null unique,
    valor                     text not null,
    tipo                      varchar(20) not null default 'texto'
                              check (tipo in ('texto', 'numero', 'booleano')),
    descripcion               varchar(180) not null default '',
    creado_en                 timestamptz not null default now(),
    actualizado_en            timestamptz not null default now()
);

insert into public.configuraciones_sistema (clave, valor, tipo, descripcion)
values
    ('modo_mantenimiento', 'false', 'booleano', 'Bloquea el acceso de usuarios durante tareas de mantenimiento.'),
    ('correo_soporte', 'soporte@imvolt.ec', 'texto', 'Correo de contacto que se muestra a los usuarios.')
on conflict (clave) do nothing;

alter table public.configuraciones_sistema enable row level security;
revoke all on public.configuraciones_sistema from anon, authenticated;
