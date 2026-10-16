-- =============================================================================
-- IMVOLT API — esquema de base de datos
-- Alineado al DIAGRAMA RELACIONAL del proyecto (2026).
--
-- Este archivo reemplaza por completo al esquema anterior (documento maestro):
-- se eliminaron organizaciones, membresías, proyectos, media_assets, brand_kits,
-- ai_templates, model_registry, generation_jobs/outputs, meta_connections,
-- campaigns, insights, leads, planes, suscripciones y wallets de créditos.
--
-- Relación con el código:
--   • Las 20 tablas con CRUD expuesto en /api/v1 tienen su modelo en
--     src/models/*.model.ts, su Request/Resource y su documentación OpenAPI.
--   • `integraciones` es una tabla de apoyo del diagrama (catálogo de
--     proveedores disponibles) y NO tiene CRUD: se alimenta con esta semilla.
--   • La autenticación vive en Supabase Auth; el usuario local, su empresa y
--     sus roles se resuelven en usuarios + roles_usuarios + roles.
--
-- Seguridad: todas las tablas habilitan RLS SIN políticas permisivas, de modo
-- que ni el anon key ni un usuario autenticado pueden leerlas directamente
-- desde el navegador. Todo el acceso pasa por el API, que usa la service role
-- key (bypass RLS) y aplica sesión + RBAC + acote por empresa.
-- =============================================================================

-- ── IDENTIDAD ────────────────────────────────────────────────────────────────

create table if not exists public.empresas (
    empresa_id      bigserial primary key,
    razon_social    varchar(120) not null,
    -- El RUC puede quedar pendiente al registrar la cuenta.
    ruc             varchar(13),
    estado          varchar(20) not null default 'activo',
    creado_en       timestamptz not null default now(),
    actualizado_en  timestamptz not null default now()
);

create table if not exists public.usuarios (
    usuario_id                   bigserial primary key,
    nombre                       varchar(120) not null,
    email                        varchar(120) not null unique,
    telefono                     varchar(20),
    empresa_id                   bigint not null references public.empresas (empresa_id),
    contrasenia_temporal_hasta   timestamptz,
    estado                       varchar(20) not null default 'activo',
    creado_en                    timestamptz not null default now(),
    actualizado_en               timestamptz not null default now()
);

create table if not exists public.roles (
    rol_id         bigserial primary key,
    nombre         varchar(30) not null unique,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create table if not exists public.permisos (
    permiso_id     bigserial primary key,
    nombre         varchar(60) not null unique,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create table if not exists public.roles_usuarios (
    usuario_rol_id bigserial primary key,
    usuario_id     bigint not null references public.usuarios (usuario_id) on delete cascade,
    rol_id         bigint not null references public.roles (rol_id),
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (usuario_id, rol_id)
);

create table if not exists public.roles_permisos (
    permiso_rol_id bigserial primary key,
    rol_id         bigint not null references public.roles (rol_id) on delete cascade,
    permiso_id     bigint not null references public.permisos (permiso_id) on delete cascade,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (rol_id, permiso_id)
);

create table if not exists public.hitos_lanzamientos (
    hito_lanzamiento_id bigserial primary key,
    nombre              varchar(60) not null,
    descripcion         text not null,
    orden               integer not null,
    obligatorio         boolean not null default false,
    estado              varchar(20) not null default 'activo',
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now()
);

create table if not exists public.empresas_hitos (
    empresa_hito_id     bigserial primary key,
    empresa_id          bigint not null references public.empresas (empresa_id) on delete cascade,
    hito_lanzamiento_id bigint not null references public.hitos_lanzamientos (hito_lanzamiento_id),
    observaciones       text not null,
    estado              varchar(20) not null default 'activo',
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now(),
    unique (empresa_id, hito_lanzamiento_id)
);

create table if not exists public.configuraciones_integraciones (
    configuracion_integracion_id bigserial primary key,
    url_base                     varchar(200) not null,
    api_key                      varchar(200) not null,
    entorno                      varchar(20) not null,
    api_id                       varchar(100),
    app_secret                   varchar(200),
    access_token                 varchar(500),
    estado                       varchar(20) not null default 'activo',
    creado_en                    timestamptz not null default now(),
    actualizado_en               timestamptz not null default now()
);

-- Catálogo de proveedores integrables (alimentado por la semilla, sin CRUD).
create table if not exists public.integraciones (
    integracion_id bigserial primary key,
    nombre         varchar(50) not null,
    proveedor      varchar(50),
    descripcion    text,
    activa         boolean not null default true,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create table if not exists public.empresas_integraciones (
    empresa_integracion_id       bigserial primary key,
    empresa_id                   bigint not null references public.empresas (empresa_id) on delete cascade,
    integracion_id               bigint not null references public.integraciones (integracion_id),
    configuracion_integracion_id bigint not null references public.configuraciones_integraciones (configuracion_integracion_id),
    referencia_credencial        text not null,
    estado                       varchar(20) not null default 'activo',
    creado_en                    timestamptz not null default now(),
    actualizado_en               timestamptz not null default now(),
    unique (empresa_id, integracion_id)
);

-- ── PROPIEDADES ──────────────────────────────────────────────────────────────

create table if not exists public.tipos_propiedades (
    tipo_propiedad_id bigserial primary key,
    nombre            varchar(30) not null,
    estado            varchar(20) not null default 'activo',
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);

create table if not exists public.propiedades (
    propiedad_id       bigserial primary key,
    nombre             varchar(50) not null,
    ubicacion          text not null,
    precio             numeric(12, 2) not null,
    disponibilidad     varchar(30) not null default 'disponible',
    descripcion        text not null,
    empresa_id         bigint not null references public.empresas (empresa_id),
    tipo_propiedad_id  bigint not null references public.tipos_propiedades (tipo_propiedad_id),
    estado             varchar(20) not null default 'activo',
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

-- ── CREATIVE ─────────────────────────────────────────────────────────────────

create table if not exists public.tipos_plantillas (
    tipo_plantilla_id bigserial primary key,
    nombre            varchar(50) not null,
    descripcion       text not null,
    estado            varchar(20) not null default 'activo',
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);

create table if not exists public.plantillas (
    plantilla_id       bigserial primary key,
    nombre             varchar(50) not null,
    descripcion        text,
    url_logo           varchar(200),
    tipo_plantilla_id  bigint not null references public.tipos_plantillas (tipo_plantilla_id),
    estado             varchar(20) not null default 'activo',
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

create table if not exists public.formatos (
    formato_id     bigserial primary key,
    nombre         varchar(50) not null,
    descripcion    text,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create table if not exists public.enfoques_comerciales (
    enfoque_comercial_id bigserial primary key,
    nombre               varchar(50) not null,
    descripcion          text,
    estado               varchar(20) not null default 'activo',
    creado_en            timestamptz not null default now(),
    actualizado_en       timestamptz not null default now()
);

create table if not exists public.contenidos_ia (
    contenido_ia_id        bigserial primary key,
    propiedad_id           bigint not null references public.propiedades (propiedad_id) on delete cascade,
    plantilla_id           bigint not null references public.plantillas (plantilla_id),
    formato_id             bigint not null references public.formatos (formato_id),
    duracion               varchar(20) not null,
    enfoque_comercial_id   bigint not null references public.enfoques_comerciales (enfoque_comercial_id),
    url_imagen_referencia  varchar(500),
    estado                 varchar(20) not null default 'activo',
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now()
);

-- ── PUBLICIDAD ───────────────────────────────────────────────────────────────

create table if not exists public.objetivo_publicidad (
    objetivo_publicidad_id bigserial primary key,
    nombre                 varchar(30) not null,
    estado                 varchar(20) not null default 'activo',
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now()
);

create table if not exists public.campanias_publicitarias (
    campania_publicitaria_id bigserial primary key,
    propiedad_id             bigint not null references public.propiedades (propiedad_id) on delete cascade,
    objetivo_publicidad_id   bigint not null references public.objetivo_publicidad (objetivo_publicidad_id),
    presupuesto_diario       numeric(12, 2) not null,
    duracion_dias            numeric(8, 2) not null,
    zona_referencia          varchar(50) not null,
    copy_anuncio             text not null,
    estado                   varchar(20) not null default 'activo',
    creado_en                timestamptz not null default now(),
    actualizado_en           timestamptz not null default now()
);

-- ── LEADS ────────────────────────────────────────────────────────────────────

create table if not exists public.contactos (
    contacto_id  bigserial primary key,
    nombres      varchar(30) not null,
    apellidos    varchar(30) not null,
    correo       varchar(120) not null,
    telefono     varchar(13) not null,
    origen       varchar(20) not null,
    propiedad_id bigint references public.propiedades (propiedad_id) on delete set null,
    estado       varchar(20) not null default 'activo',
    creado_en    timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

-- ── ÍNDICES (filtros frecuentes de los CRUD) ─────────────────────────────────

create index if not exists idx_usuarios_empresa        on public.usuarios (empresa_id);
create index if not exists idx_usuarios_email         on public.usuarios (email);
create index if not exists idx_roles_usuarios_usuario  on public.roles_usuarios (usuario_id);
create index if not exists idx_roles_usuarios_rol      on public.roles_usuarios (rol_id);
create index if not exists idx_roles_permisos_rol      on public.roles_permisos (rol_id);
create index if not exists idx_empresas_hitos_empresa  on public.empresas_hitos (empresa_id);
create index if not exists idx_empresas_int_empresa    on public.empresas_integraciones (empresa_id);
create index if not exists idx_propiedades_empresa     on public.propiedades (empresa_id);
create index if not exists idx_propiedades_tipo        on public.propiedades (tipo_propiedad_id);
create index if not exists idx_propiedades_dispon      on public.propiedades (disponibilidad);
create index if not exists idx_plantillas_tipo         on public.plantillas (tipo_plantilla_id);
create index if not exists idx_contenidos_propiedad    on public.contenidos_ia (propiedad_id);
create index if not exists idx_contenidos_plantilla    on public.contenidos_ia (plantilla_id);
create index if not exists idx_campanias_propiedad     on public.campanias_publicitarias (propiedad_id);
create index if not exists idx_campanias_objetivo      on public.campanias_publicitarias (objetivo_publicidad_id);
create index if not exists idx_contactos_propiedad     on public.contactos (propiedad_id);
create index if not exists idx_contactos_origen        on public.contactos (origen);

-- ── RLS: denegado por defecto ────────────────────────────────────────────────
-- El API accede con la service role key (bypass de RLS) y aplica autenticación,
-- RBAC y acote por empresa. Desde el navegador no hay acceso directo.

do $$
declare
    tabla text;
begin
    foreach tabla in array array[
        'empresas', 'usuarios', 'roles', 'permisos', 'roles_usuarios',
        'roles_permisos', 'hitos_lanzamientos', 'empresas_hitos',
        'configuraciones_integraciones', 'integraciones', 'empresas_integraciones',
        'tipos_propiedades', 'propiedades', 'tipos_plantillas', 'plantillas',
        'formatos', 'enfoques_comerciales', 'contenidos_ia',
        'objetivo_publicidad', 'campanias_publicitarias', 'contactos'
    ]
    loop
        execute format('alter table public.%I enable row level security', tabla);
        execute format('revoke all on public.%I from anon, authenticated', tabla);
    end loop;
end $$;

-- ── SEMILLAS ─────────────────────────────────────────────────────────────────

-- Roles del RBAC (los usa requireRole: propietario | administrador | marketing |
-- agente | lector).
insert into public.roles (nombre) values
    ('propietario'),
    ('administrador'),
    ('marketing'),
    ('agente'),
    ('lector')
on conflict (nombre) do nothing;

-- Permisos del catálogo.
insert into public.permisos (nombre) values
    ('gestionar_usuarios'),
    ('gestionar_propiedades'),
    ('crear_contenidos'),
    ('gestionar_campanas'),
    ('ver_analitica'),
    ('gestionar_integraciones')
on conflict (nombre) do nothing;

-- El propietario y el administrador heredan todos los permisos.
insert into public.roles_permisos (rol_id, permiso_id)
select r.rol_id, p.permiso_id
from public.roles r
cross join public.permisos p
where r.nombre in ('propietario', 'administrador')
on conflict (rol_id, permiso_id) do nothing;

-- Marketing publica contenidos y campañas; el agente solo ve propiedades.
insert into public.roles_permisos (rol_id, permiso_id)
select r.rol_id, p.permiso_id
from public.roles r
join public.permisos p on p.nombre in ('crear_contenidos', 'gestionar_campanas', 'ver_analitica')
where r.nombre = 'marketing'
on conflict (rol_id, permiso_id) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.rol_id, p.permiso_id
from public.roles r
join public.permisos p on p.nombre in ('gestionar_propiedades', 'ver_analitica')
where r.nombre = 'agente'
on conflict (rol_id, permiso_id) do nothing;

-- Tipos de propiedad.
insert into public.tipos_propiedades (nombre) values
    ('Lote'), ('Casa'), ('Departamento'), ('Oficina'), ('Local'), ('Proyecto')
on conflict do nothing;

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

-- Objetivos de publicidad (compatibles con Meta Marketing API).
insert into public.objetivo_publicidad (nombre) values
    ('Mensajes'), ('Formularios'), ('Visitas'), ('Tráfico'), ('Branding')
on conflict do nothing;

-- Hitos de lanzamiento (checklist de la empresa).
insert into public.hitos_lanzamientos (nombre, descripcion, orden, obligatorio) values
    ('Fotografía profesional', 'Sesión autorizada de fotos originales del inmueble', 1, true),
    ('Renders conceptuales', 'Imágenes generadas, identificadas como representación conceptual', 2, false),
    ('Ficha publicada', 'Propiedad visible en el catálogo con precio y disponibilidad verificados', 3, true),
    ('Campañas activas', 'Al menos una campaña en pausa aprobada y lista para publicar', 4, false)
on conflict do nothing;

-- Proveedores integrables (catálogo de apoyo, sin CRUD).
insert into public.integraciones (nombre, proveedor, descripcion) values
    ('Meta Ads', 'Meta', 'Publicación de campañas en Facebook e Instagram'),
    ('WhatsApp Business', 'Meta', 'Conversaciones con prospectos desde anuncios'),
    ('Higgsfield', 'Higgsfield', 'Generación de imagen y video con IA')
on conflict do nothing;
