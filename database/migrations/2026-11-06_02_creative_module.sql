-- Canonical Creative contracts over the existing Spanish tables.
-- The API keeps its established routes and storage tables; these views expose
-- the names used by the frontend domain without duplicating catalog/job data.

create or replace view public.templates as
select
    plantilla_id as template_id,
    nombre as name,
    descripcion as description,
    url_logo as logo_url,
    tipo_plantilla_id as template_type_id,
    estado as status,
    creado_en as created_at,
    actualizado_en as updated_at
from public.plantillas;

create or replace view public.model_registry as
select
    modelo_id as model_id,
    proveedor as provider,
    modelo_proveedor_id as provider_model_id,
    nombre,
    tipo_media as media_type,
    capacidades as capabilities,
    duracion_min_s,
    duracion_max_s,
    ratios,
    creditos_cotizacion as quote_creditos,
    precio_usd,
    precio_unidad,
    estado as status,
    creado_en as created_at,
    actualizado_en as updated_at
from public.modelos_ia;

create or replace view public.generation_jobs as
select
    generacion_id as generation_id,
    empresa_id as organization_id,
    propiedad_id as property_id,
    plantilla_id as template_id,
    modelo_id as model_id,
    modo,
    prompt,
    parametros,
    estado as status,
    idempotency_key,
    creditos_costo as credits_cost,
    peticion_proveedor_id as provider_request_id,
    error_mensaje as error_message,
    creado_en as created_at,
    actualizado_en as updated_at
from public.generaciones;

create table if not exists public.generation_outputs (
    generation_output_id bigserial primary key,
    generation_id        bigint not null
        references public.generaciones (generacion_id) on delete cascade,
    output_index         integer not null check (output_index >= 0),
    media_type           varchar(10) not null check (media_type in ('image', 'video')),
    output_url           text not null,
    mime_type            varchar(100),
    metadata             jsonb not null default '{}'::jsonb,
    created_at           timestamptz not null default now(),
    constraint uq_generation_outputs_job_index unique (generation_id, output_index)
);

create index if not exists idx_generation_outputs_generation
    on public.generation_outputs (generation_id, output_index);

alter table public.generation_outputs enable row level security;

revoke all on public.templates, public.model_registry, public.generation_jobs,
    public.generation_outputs from public, anon, authenticated;
grant select, insert, update, delete on public.templates, public.model_registry,
    public.generation_jobs, public.generation_outputs to service_role;
grant usage, select on sequence public.generation_outputs_generation_output_id_seq
    to service_role;

notify pgrst, 'reload schema';
