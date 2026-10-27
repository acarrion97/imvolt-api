-- Documento Maestro §09–§10: catálogo de modelos, trabajos IA y cuentas Meta.
-- Requiere database/schema.sql. Idempotente; ejecutar antes de la migración 02.

create table if not exists public.conexiones (
    conexion_id            bigserial primary key,
    empresa_id             bigint not null references public.empresas (empresa_id) on delete cascade,
    cuenta_publicitaria_id varchar(100) not null,
    nombre_cuenta          varchar(120) not null,
    estado                 varchar(20) not null default 'pendiente'
        check (estado in ('pendiente', 'conectada', 'revocada')),
    permisos               jsonb,
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now(),
    unique (empresa_id, cuenta_publicitaria_id)
);

create index if not exists idx_conexiones_empresa
    on public.conexiones (empresa_id, creado_en desc);

create table if not exists public.modelos_ia (
    modelo_id           bigserial primary key,
    proveedor           varchar(50) not null,
    modelo_proveedor_id varchar(120) not null,
    nombre              varchar(120) not null,
    tipo_media          varchar(10) not null check (tipo_media in ('image', 'video')),
    capacidades         jsonb not null default '{}'::jsonb,
    duracion_min_s      integer,
    duracion_max_s      integer,
    ratios              jsonb,
    creditos_cotizacion integer not null default 1,
    estado              varchar(20) not null default 'activo'
        check (estado in ('activo', 'inactivo', 'no_disponible')),
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now(),
    unique (proveedor, modelo_proveedor_id)
);

create index if not exists idx_modelos_ia_estado on public.modelos_ia (estado);

insert into public.modelos_ia
    (proveedor, modelo_proveedor_id, nombre, tipo_media, capacidades, duracion_min_s, duracion_max_s, ratios, creditos_cotizacion, estado)
values
    ('higgsfield', 'higgsfield/soul-4-image', 'Soul 4 Image', 'image',
     '{"max_resolution": "2048x2048", "styles": ["realista", "cinematic"]}'::jsonb,
     null, null, '["1:1", "4:5", "16:9", "9:16"]'::jsonb, 2, 'activo'),
    ('higgsfield', 'higgsfield/veo3-video', 'Veo 3 Video', 'video',
     '{"audio": true, "motion_control": true}'::jsonb,
     5, 12, '["9:16", "16:9"]'::jsonb, 8, 'activo'),
    ('higgsfield', 'higgsfield/sdxl-fast', 'SDXL Fast', 'image',
     '{"fast": true}'::jsonb,
     null, null, '["1:1", "4:5"]'::jsonb, 1, 'no_disponible')
on conflict (proveedor, modelo_proveedor_id) do nothing;

create table if not exists public.generaciones (
    generacion_id         bigserial primary key,
    empresa_id            bigint not null references public.empresas (empresa_id) on delete cascade,
    propiedad_id          bigint references public.propiedades (propiedad_id) on delete set null,
    plantilla_id          bigint references public.plantillas (plantilla_id) on delete set null,
    modelo_id             bigint not null references public.modelos_ia (modelo_id),
    modo                  varchar(10) not null default 'facil' check (modo in ('facil', 'pro')),
    prompt                text not null,
    parametros            jsonb not null default '{}'::jsonb,
    estado                varchar(20) not null default 'created'
        check (estado in ('created', 'quoted', 'credits_reserved', 'queued',
                          'processing', 'completed', 'failed', 'canceled')),
    creditos_costo        integer not null default 0,
    peticion_proveedor_id varchar(120),
    error_mensaje         text,
    creado_en             timestamptz not null default now(),
    actualizado_en        timestamptz not null default now()
);

create index if not exists idx_generaciones_empresa on public.generaciones (empresa_id, creado_en desc);
create index if not exists idx_generaciones_estado on public.generaciones (estado);
create index if not exists idx_generaciones_propiedad on public.generaciones (propiedad_id);

alter table public.conexiones enable row level security;
revoke all on public.conexiones from anon, authenticated;
alter table public.modelos_ia enable row level security;
revoke all on public.modelos_ia from anon, authenticated;
alter table public.generaciones enable row level security;
revoke all on public.generaciones from anon, authenticated;

notify pgrst, 'reload schema';
