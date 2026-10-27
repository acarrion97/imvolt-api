-- =============================================================================
-- IMVOLT API — esquema de base de datos
-- Alineado al DIAGRAMA RELACIONAL del proyecto (2026).
--
-- Este archivo reemplaza por completo al esquema anterior (documento maestro):
-- se eliminaron organizaciones, membresías, brand_kits, ai_templates,
-- model_registry, generation_jobs/outputs, meta_connections, campaigns,
-- insights, leads, planes, suscripciones y wallets de créditos. El módulo
-- CATALOG vuelve con `proyectos` y `media_assets` (+ versiones), que conviven
-- con `propiedades` y el Brand Kit.
--
-- Relación con el código:
--   • Las 24 rutas CRUD expuestas en /api/v1 tienen su modelo en
--     src/models/*.model.ts, su Request/Resource y su documentación OpenAPI.
--   • `brand_assets` / `brand_asset_versions` / `brand_colors` (Brand Kit)
--     guardan solo METADATOS: los blobs viven en el bucket privado
--     `brand-kit` de Supabase Storage (10 MB máximo + catálogo de MIME
--     types), que este archivo crea y `services/brandkit.storage.ts` vigila
--     al arrancar.
--   • `integraciones` es una tabla de apoyo del diagrama (catálogo de
--     proveedores disponibles) y NO tiene CRUD: se alimenta con esta semilla.
--   • `audit_logs` es la bitácora de escrituras: solo lectura desde el API
--     (GET /api/v1/auditoria, restringido a propietario y administrador).
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
    empresa_id                   bigint references public.empresas (empresa_id) on delete cascade,
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

-- ── CATÁLOGO: PROYECTOS ───────────────────────────────────────────────────────
-- Un proyecto agrupa propiedades de un mismo desarrollo (lotización,
-- urbanización, edificio…). `propiedades.proyecto_id` es nullable: las
-- propiedades sueltas (individuales) pueden quedar sin proyecto.

create table if not exists public.proyectos (
    proyecto_id    bigserial primary key,
    nombre         varchar(120) not null,
    tipo           varchar(30) not null default 'individual',
    descripcion    text,
    ubicacion      text,
    total_lotes    integer,
    empresa_id     bigint not null references public.empresas (empresa_id) on delete cascade,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
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
    -- Desarrollo al que pertenece la propiedad; null = inmueble individual.
    proyecto_id        bigint references public.proyectos (proyecto_id) on delete set null,
    estado             varchar(20) not null default 'activo',
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now()
);

-- Asegura la relación también en instalaciones donde `propiedades` existía
-- antes de agregar la asociación con proyectos.
alter table public.propiedades
    add column if not exists proyecto_id bigint;

do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute source_column
          on source_column.attrelid = c.conrelid
         and source_column.attnum = c.conkey[1]
        join pg_attribute target_column
          on target_column.attrelid = c.confrelid
         and target_column.attnum = c.confkey[1]
        where c.contype = 'f'
          and array_length(c.conkey, 1) = 1
          and array_length(c.confkey, 1) = 1
          and c.conrelid = 'public.propiedades'::regclass
          and c.confrelid = 'public.proyectos'::regclass
          and source_column.attname = 'proyecto_id'
          and target_column.attname = 'proyecto_id'
    ) then
        alter table public.propiedades
            add constraint fk_propiedades_proyecto
            foreign key (proyecto_id)
            references public.proyectos (proyecto_id)
            on delete set null;
    end if;
end
$$;

-- ── CATÁLOGO: MEDIA ASSETS ───────────────────────────────────────────────────
-- Medios finales de la empresa (fotos, renders, videos, documentos) guardados
-- en almacenamiento propio (§12: no depender del CDN del proveedor).
--
-- Un MEDIO es solo metadatos: su blob vive en el bucket privado `media-assets`
-- de Supabase Storage, que este archivo crea y `services/media.storage.ts`
-- vigila al arrancar. `media_asset_versions` guarda el historial;
-- `version_activa_id` apunta a la versión que se sirve con URL firmada.

create table if not exists public.media_assets (
    media_asset_id    bigserial primary key,
    nombre            varchar(80) not null,
    -- Categoría: define qué tipos de archivo se aceptan al subir.
    categoria         varchar(30) not null default 'imagen',
    descripcion       text,
    -- Agrupación opcional del medio: un proyecto, una propiedad, o ninguno.
    proyecto_id       bigint references public.proyectos (proyecto_id) on delete set null,
    propiedad_id      bigint references public.propiedades (propiedad_id) on delete set null,
    -- FK hacia abajo: la tabla hija todavía no existe al crear la madre.
    version_activa_id bigint,
    empresa_id        bigint not null references public.empresas (empresa_id) on delete cascade,
    estado            varchar(20) not null default 'activo',
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);

create table if not exists public.media_asset_versions (
    media_asset_version_id bigserial primary key,
    media_asset_id         bigint not null references public.media_assets (media_asset_id) on delete cascade,
    -- Número correlativo dentro del medio (1 = v1, 2 = v2…).
    numero                 integer not null,
    nombre_archivo         varchar(200) not null,
    -- Ruta DENTRO del bucket privado; nunca se expone al cliente como tal.
    ruta_storage           varchar(300) not null,
    mime_type              varchar(100),
    tamano_bytes           bigint,
    nota                   text,
    subido_por             bigint references public.usuarios (usuario_id) on delete set null,
    empresa_id             bigint not null references public.empresas (empresa_id) on delete cascade,
    estado                 varchar(20) not null default 'activo',
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now()
);

-- Relación inversa (medio → versión activa). El nombre del constraint es el
-- que PostgREST usa para desambiguar: hay DOS llaves entre ambas tablas y el
-- API incrusta `media_asset_versions!fk_media_asset_version_activa`.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_media_asset_version_activa'
          and conrelid = 'public.media_assets'::regclass
    ) then
        alter table public.media_assets
            add constraint fk_media_asset_version_activa
            foreign key (version_activa_id)
            references public.media_asset_versions (media_asset_version_id)
            on delete set null;
    end if;
end $$;

-- Bucket privado de Supabase Storage para los medios: sin acceso público, con
-- el límite de 100 MB (videos y renders pesados) y el catálogo de tipos que
-- valida el API antes de subir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'media-assets',
    'media-assets',
    false,
    104857600,
    array[
        'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
        'video/mp4', 'video/webm',
        'application/pdf'
    ]
)
on conflict (id) do nothing;

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
    -- Publicación en Meta (siempre PAUSED). Ver migrations/2026-10-27_meta_campaign_publish.sql
    meta_campaign_id         varchar(40),
    meta_estado              varchar(20) check (meta_estado is null or meta_estado in ('publicando', 'published_paused')),
    publicada_en             timestamptz,
    estado                   varchar(20) not null default 'activo',
    creado_en                timestamptz not null default now(),
    actualizado_en           timestamptz not null default now()
);

create unique index if not exists uq_campanias_meta_campaign
    on public.campanias_publicitarias (meta_campaign_id)
    where meta_campaign_id is not null;

-- ── LEADS ────────────────────────────────────────────────────────────────────

create table if not exists public.contactos (
    contacto_id  bigserial primary key,
    nombres      varchar(30) not null,
    apellidos    varchar(30) not null,
    correo       varchar(120) not null,
    telefono     varchar(13) not null,
    origen       varchar(20) not null,
    propiedad_id bigint references public.propiedades (propiedad_id) on delete set null,
    empresa_id   bigint references public.empresas (empresa_id) on delete cascade,
    estado       varchar(20) not null default 'activo',
    creado_en    timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

-- ── BRAND KIT (identidad de marca) ───────────────────────────────────────────
-- Archivos de marca y colores de la paleta de la empresa.
--
-- Un ARCHIVO es solo metadatos: su blob vive en el bucket privado `brand-kit`
-- de Supabase Storage (10 MB máximo, catálogo de MIME types) y se sirve
-- siempre con URL firmada de 5 minutos (`src/services/brandkit.storage.ts`).
-- `brand_asset_versions` guarda el historial; `version_activa_id` apunta a la
-- versión que se previsualiza y se descarga.

create table if not exists public.brand_assets (
    brand_asset_id    bigserial primary key,
    nombre            varchar(80) not null,
    -- Categoría: define qué tipos de archivo se aceptan al subir.
    categoria         varchar(30) not null default 'logo',
    descripcion       text,
    -- FK hacia abajo: la tabla hija todavía no existe al crear la madre, por
    -- eso se declara al final con su nombre (`fk_brand_asset_version_activa`).
    version_activa_id bigint,
    empresa_id        bigint not null references public.empresas (empresa_id) on delete cascade,
    estado            varchar(20) not null default 'activo',
    creado_en         timestamptz not null default now(),
    actualizado_en    timestamptz not null default now()
);

create table if not exists public.brand_asset_versions (
    brand_asset_version_id bigserial primary key,
    brand_asset_id         bigint not null references public.brand_assets (brand_asset_id) on delete cascade,
    -- Número correlativo dentro del archivo (1 = v1, 2 = v2…).
    numero                 integer not null,
    nombre_archivo         varchar(200) not null,
    -- Ruta DENTRO del bucket privado; nunca se expone al cliente como tal.
    ruta_storage           varchar(300) not null,
    mime_type              varchar(100),
    tamano_bytes           bigint,
    nota                   text,
    subido_por             bigint references public.usuarios (usuario_id) on delete set null,
    empresa_id             bigint not null references public.empresas (empresa_id) on delete cascade,
    estado                 varchar(20) not null default 'activo',
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now()
);

-- Relación inversa (archivo → versión activa). El nombre del constraint es el
-- que PostgREST usa para desambiguar: hay DOS llaves entre ambas tablas y el
-- API incrusta `brand_asset_versions!fk_brand_asset_version_activa`.
-- Se declara después porque `brand_asset_versions` aún no existía al crear la
-- tabla madre (Postgres no admite `add constraint if not exists`).
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_brand_asset_version_activa'
          and conrelid = 'public.brand_assets'::regclass
    ) then
        alter table public.brand_assets
            add constraint fk_brand_asset_version_activa
            foreign key (version_activa_id)
            references public.brand_asset_versions (brand_asset_version_id)
            on delete set null;
    end if;
end $$;

create table if not exists public.brand_colors (
    brand_color_id bigserial primary key,
    nombre         varchar(50) not null,
    -- #RRGGBB
    hex            varchar(7) not null,
    uso            varchar(30) not null default 'principal',
    orden          integer not null default 0,
    empresa_id     bigint not null references public.empresas (empresa_id) on delete cascade,
    estado         varchar(20) not null default 'activo',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

-- Bucket privado de Supabase Storage: sin acceso público, con el mismo límite
-- de 10 MB y catálogo de tipos que valida el API antes de subir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'brand-kit',
    'brand-kit',
    false,
    10485760,
    array[
        'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf',
        'font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/font-woff'
    ]
)
on conflict (id) do nothing;

-- ── AUDITORÍA ───────────────────────────────────────────────────────────────
-- Trazas de las escrituras del API (CREATE / UPDATE / DELETE y eventos de
-- cuenta). Es una bitácora de SÓLO LECTURA desde el API: no tiene CRUD de
-- escritura y sobrevive al borrado de usuarios/empresas (FK on delete set null).

create table if not exists public.audit_logs (
    audit_log_id  bigserial primary key,
    accion        varchar(10) not null,
    tabla         varchar(60) not null,
    -- Id del registro afectado (texto por flexibilidad entre tablas).
    registro_id   varchar(50),
    -- Usuario de Supabase Auth (UUID); puede no existir en `usuarios`.
    auth_user_id  varchar(36),
    -- Fila local del usuario en `usuarios`; set null si se borra el usuario.
    usuario_id    bigint references public.usuarios (usuario_id) on delete set null,
    -- Tenant al que pertenece la acción (set null si se borra la empresa).
    empresa_id    bigint references public.empresas (empresa_id) on delete set null,
    -- Payload involucrado, con credenciales enmascaradas por el API.
    detalles      jsonb,
    creado_en     timestamptz not null default now()
);

-- ── ÍNDICES (filtros frecuentes de los CRUD) ─────────────────────────────────

create index if not exists idx_usuarios_empresa        on public.usuarios (empresa_id);
create index if not exists idx_contactos_empresa        on public.contactos (empresa_id);
create index if not exists idx_config_integraciones_empresa on public.configuraciones_integraciones (empresa_id);
create index if not exists idx_usuarios_email         on public.usuarios (email);
create index if not exists idx_roles_usuarios_usuario  on public.roles_usuarios (usuario_id);
create index if not exists idx_roles_usuarios_rol      on public.roles_usuarios (rol_id);
create index if not exists idx_roles_permisos_rol      on public.roles_permisos (rol_id);
create index if not exists idx_empresas_hitos_empresa  on public.empresas_hitos (empresa_id);
create index if not exists idx_empresas_int_empresa    on public.empresas_integraciones (empresa_id);
create index if not exists idx_proyectos_empresa      on public.proyectos (empresa_id);
create index if not exists idx_proyectos_tipo         on public.proyectos (tipo);
create index if not exists idx_propiedades_empresa     on public.propiedades (empresa_id);
create index if not exists idx_propiedades_tipo        on public.propiedades (tipo_propiedad_id);
create index if not exists idx_propiedades_proyecto    on public.propiedades (proyecto_id);
create index if not exists idx_propiedades_dispon      on public.propiedades (disponibilidad);
create index if not exists idx_plantillas_tipo         on public.plantillas (tipo_plantilla_id);
create index if not exists idx_contenidos_propiedad    on public.contenidos_ia (propiedad_id);
create index if not exists idx_contenidos_plantilla    on public.contenidos_ia (plantilla_id);
create index if not exists idx_campanias_propiedad     on public.campanias_publicitarias (propiedad_id);
create index if not exists idx_campanias_objetivo      on public.campanias_publicitarias (objetivo_publicidad_id);
create index if not exists idx_contactos_propiedad     on public.contactos (propiedad_id);
create index if not exists idx_contactos_origen        on public.contactos (origen);
create index if not exists idx_brand_assets_empresa   on public.brand_assets (empresa_id);
create index if not exists idx_brand_assets_estado    on public.brand_assets (estado);
create index if not exists idx_brand_versions_asset   on public.brand_asset_versions (brand_asset_id);
create index if not exists idx_brand_versions_numero  on public.brand_asset_versions (brand_asset_id, numero desc);
create index if not exists idx_media_assets_empresa   on public.media_assets (empresa_id);
create index if not exists idx_media_assets_estado    on public.media_assets (estado);
create index if not exists idx_media_assets_proyecto  on public.media_assets (proyecto_id);
create index if not exists idx_media_assets_propiedad on public.media_assets (propiedad_id);
create index if not exists idx_media_versions_asset   on public.media_asset_versions (media_asset_id);
create index if not exists idx_media_versions_numero  on public.media_asset_versions (media_asset_id, numero desc);
create index if not exists idx_brand_colors_empresa   on public.brand_colors (empresa_id);
create index if not exists idx_brand_colors_orden     on public.brand_colors (empresa_id, orden);
create index if not exists idx_audit_empresa           on public.audit_logs (empresa_id);
create index if not exists idx_audit_usuario           on public.audit_logs (usuario_id);
create index if not exists idx_audit_tabla             on public.audit_logs (tabla, accion);
create index if not exists idx_audit_creado            on public.audit_logs (creado_en desc);

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
        'proyectos', 'tipos_propiedades', 'propiedades',
        'media_assets', 'media_asset_versions',
        'tipos_plantillas', 'plantillas',
        'formatos', 'enfoques_comerciales', 'contenidos_ia',
        'objetivo_publicidad', 'campanias_publicitarias', 'contactos',
        'brand_assets', 'brand_asset_versions', 'brand_colors', 'audit_logs'
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

notify pgrst, 'reload schema';
