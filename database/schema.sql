-- ═══════════════════════════════════════════════════════════════════════════
-- IMVOLT — MARKETING INMOBILIARIO AI
-- Esquema de base de datos (Supabase / PostgreSQL)
-- Documento maestro v3, §12 (arquitectura) y §13 (modelo de datos)
--
-- Ejecutar en el SQL Editor de Supabase, en orden:
--   1. Este archivo (esquema + RLS + semillas)
--   2. La aplicación usa la SERVICE ROLE KEY desde el backend únicamente
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Helpers ────────────────────────────────────────────────────────────────

-- True si el usuario autenticado tiene membresía activa en la organización.
create or replace function public.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membresias m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.activo
  );
$$;

-- True si el usuario autenticado tiene un rol con privilegio de escritura.
create or replace function public.can_write(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membresias m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.activo
      and m.rol in ('propietario', 'administrador', 'marketing')
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITY — organizaciones (tenants), usuarios, membresías
-- ═══════════════════════════════════════════════════════════════════════════

create table public.organizaciones (
  organization_id uuid primary key default gen_random_uuid(),
  nombre           text not null,
  tipo             text not null check (tipo in ('desarrollador', 'inmobiliaria', 'agente')),
  ruc              text,
  pais             text not null default 'Ecuador',
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.usuarios (
  user_id    uuid primary key,                -- coincide con auth.users.id
  nombres    text not null,
  apellidos  text not null,
  email      text not null unique,
  telefono   text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.membresias (
  membership_id  uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.usuarios (user_id) on delete cascade,
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  rol            text not null check (rol in ('propietario', 'administrador', 'marketing', 'agente', 'lector')),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (user_id, organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CATALOG — proyectos, propiedades, medios, brand kits
-- ═══════════════════════════════════════════════════════════════════════════

create table public.proyectos (
  project_id     uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  nombre         text not null,
  tipo           text not null check (tipo in ('lotizacion', 'urbanizacion', 'edificio', 'proyecto_planos', 'individual')),
  descripcion    text,
  ubicacion      text,
  total_lotes    integer check (total_lotes > 0),
  estado         text not null default 'activo' check (estado in ('activo', 'pausado', 'terminado')),
  created_at     timestamptz not null default now()
);

create table public.propiedades (
  property_id     uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  project_id      uuid references public.proyectos (project_id) on delete set null,
  nombre          text not null,
  categoria       text not null check (categoria in ('lote', 'casa', 'departamento', 'oficina', 'local', 'proyecto')),
  titulo_publicacion text,
  descripcion     text,
  precio          numeric(14, 2) check (precio >= 0),
  moneda          char(3) not null default 'USD',
  superficie_m2   numeric(12, 2) check (superficie_m2 >= 0),
  habitaciones    integer check (habitaciones >= 0),
  banos           integer check (banos >= 0),
  estacionamientos integer check (estacionamientos >= 0),
  direccion       text,
  ciudad          text,
  pais            text not null default 'Ecuador',
  estado          text not null default 'disponible'
                  check (estado in ('disponible', 'reservada', 'vendida', 'no_disponible')),
  -- Fidelidad de contenido (§07): si true, la UI debe etiquetar renders conceptuales.
  tiene_render_conceptual boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.media_assets (
  media_id    uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  property_id uuid references public.propiedades (property_id) on delete cascade,
  tipo        text not null check (tipo in ('foto', 'render', 'video', 'plano', 'documento')),
  nombre      text not null,
  url         text not null,
  -- La fotografía original con derechos de uso que la IA debe preservar.
  es_referencia_original boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.brand_kits (
  brand_kit_id    uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  nombre          text not null,
  logo_url        text,
  color_primario  text,
  color_secundario text,
  tipografia      text,
  created_at      timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CREATIVE — plantillas, modelos, generaciones y outputs
-- ═══════════════════════════════════════════════════════════════════════════

create table public.ai_templates (
  template_id  uuid primary key default gen_random_uuid(),
  -- null = plantilla del sistema visible para todas las organizaciones.
  organization_id uuid references public.organizaciones (organization_id) on delete cascade,
  nombre       text not null,
  categoria    text not null check (categoria in
               ('lotizaciones', 'casas', 'departamentos', 'proyecto_planos', 'publicidad_comercial', 'marca_inmobiliaria')),
  objetivo     text not null check (objetivo in ('visitas', 'mensajes', 'formularios', 'branding')),
  media_type   text not null check (media_type in ('image', 'video')),
  formato      text not null check (formato in ('reels_9_16', 'imagen_4_5', 'feed_1_1', 'banner_16_9')),
  variables    jsonb not null default '[]',
  estructura_narrativa text,
  movimiento_camara    text,
  estilo_visual        text,
  prompt_base  text not null,
  requiere_referencia_original boolean not null default false,
  creditos_base numeric not null default 1 check (creditos_base >= 0),
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.model_registry (
  model_id     uuid primary key default gen_random_uuid(),
  provider     text not null,
  provider_model_id text not null,        -- ruta del modelo; no hardcodear catálogos (§09)
  nombre       text not null,
  media_type   text not null check (media_type in ('image', 'video')),
  capabilities jsonb not null default '{}',
  duracion_min_s integer,
  duracion_max_s integer,
  ratios       jsonb,
  quote_creditos numeric not null default 1 check (quote_creditos >= 0),
  status       text not null default 'activo'
               check (status in ('activo', 'restringido', 'experimental', 'no_disponible')),
  created_at   timestamptz not null default now()
);

create table public.generation_jobs (
  generation_id  uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  property_id    uuid references public.propiedades (property_id) on delete set null,
  template_id    uuid references public.ai_templates (template_id) on delete set null,
  model_id       uuid not null references public.model_registry (model_id),
  modo           text not null default 'facil' check (modo in ('facil', 'pro')),
  prompt         text not null,
  parametros     jsonb not null default '{}',
  -- created → quoted → credits_reserved → queued → processing → completed/failed/canceled
  status         text not null default 'created' check (status in
                 ('created', 'quoted', 'credits_reserved', 'queued', 'processing', 'completed', 'failed', 'canceled')),
  credits_cost   numeric not null default 0 check (credits_cost >= 0),
  provider_request_id text,
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.generation_outputs (
  output_id     uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generation_jobs (generation_id) on delete cascade,
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  url           text not null,
  tipo          text not null check (tipo in ('image', 'video')),
  es_conceptual boolean not null default false,
  version       integer not null default 1,
  created_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ADVERTISING — conexiones Meta, campañas, aprobaciones, insights
-- ═══════════════════════════════════════════════════════════════════════════

create table public.meta_connections (
  connection_id  uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  cuenta_publicitaria_id text not null,
  nombre_cuenta  text not null,
  estado         text not null default 'pendiente' check (estado in ('conectada', 'pendiente', 'revocada')),
  permisos       jsonb,
  created_at     timestamptz not null default now()
);

create table public.campaigns (
  campaign_id    uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  connection_id  uuid references public.meta_connections (connection_id) on delete set null,
  property_id    uuid references public.propiedades (property_id) on delete set null,
  nombre         text not null,
  objetivo       text not null check (objetivo in ('mensajes', 'formularios', 'visitas', 'trafico', 'branding')),
  destino        text not null check (destino in ('whatsapp', 'formulario', 'landing')),
  -- local_draft → validated → awaiting_approval → approved → published_paused → active
  estado         text not null default 'local_draft' check (estado in
                 ('local_draft', 'validated', 'awaiting_approval', 'approved', 'published_paused', 'active', 'rejected', 'failed', 'archived')),
  presupuesto_maximo numeric(12, 2) not null check (presupuesto_maximo > 0),
  moneda         char(3) not null default 'USD',
  fecha_inicio   date,
  fecha_fin      date,
  copy           text,
  titulo         text,
  cta            text,
  creative_url   text,
  meta_campaign_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.campaign_approvals (
  approval_id    uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (campaign_id) on delete cascade,
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  aprobado_por   uuid not null,
  decision       text not null check (decision in ('aprobada', 'rechazada')),
  comentario     text,
  created_at     timestamptz not null default now()
);

create table public.insights_snapshots (
  snapshot_id    uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (campaign_id) on delete cascade,
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  gasto          numeric(12, 2) not null default 0,
  impresiones    bigint not null default 0,
  clics          bigint not null default 0,
  leads          integer not null default 0,
  alcance        bigint,
  tomado_en      timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- LEADS — prospectos captados
-- ═══════════════════════════════════════════════════════════════════════════

create table public.leads (
  lead_id        uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  campaign_id    uuid references public.campaigns (campaign_id) on delete set null,
  property_id    uuid references public.propiedades (property_id) on delete set null,
  nombre         text not null,
  email          text,
  telefono       text,
  fuente         text not null check (fuente in ('meta_formulario', 'whatsapp', 'landing', 'manual', 'lotes_al_mando')),
  estado         text not null default 'nuevo' check (estado in ('nuevo', 'contactado', 'calificado', 'visitado', 'cerrado', 'perdido')),
  notas          text,
  provider_lead_id text,               -- ID externo para deduplicar (§11)
  created_at     timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMERCE — planes, suscripciones, wallet y ledger de créditos
-- ═══════════════════════════════════════════════════════════════════════════

create table public.subscription_plans (
  plan_id     uuid primary key default gen_random_uuid(),
  nombre      text not null unique check (nombre in ('agent', 'business', 'developer')),
  precio_mensual numeric(10, 2) not null check (precio_mensual >= 0),
  propiedades_max integer not null check (propiedades_max > 0),
  usuarios_max    integer not null check (usuarios_max > 0),
  campanas_max    integer not null check (campanas_max > 0),
  incluye_lotes_al_mando boolean not null default false,
  analitica   text not null default 'basica' check (analitica in ('basica', 'intermedia', 'avanzada')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.suscripciones (
  subscription_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  plan_id     uuid not null references public.subscription_plans (plan_id),
  estado      text not null default 'activa' check (estado in ('activa', 'pausada', 'vencida', 'cancelada')),
  fecha_inicio date not null default current_date,
  fecha_fin   date,
  created_at  timestamptz not null default now()
);

create table public.credit_wallets (
  wallet_id       uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizaciones (organization_id) on delete cascade,
  saldo           numeric(12, 2) not null default 0 check (saldo >= 0),
  moneda          char(3) not null default 'USD',
  updated_at      timestamptz not null default now()
);

-- El saldo nunca se muta sin un movimiento en el ledger (§13).
create table public.credit_transactions (
  transaction_id  uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references public.credit_wallets (wallet_id) on delete cascade,
  organization_id uuid not null references public.organizaciones (organization_id) on delete cascade,
  tipo            text not null check (tipo in ('reserva', 'consumo', 'devolucion', 'recarga', 'ajuste')),
  monto           numeric(12, 2) not null,   -- positivo suma, negativo resta
  generation_id   uuid,
  descripcion     text,
  idempotency_key text,
  created_at      timestamptz not null default now()
);

-- Un mismo evento de proveedor no puede facturarse dos veces (§13).
create unique index credit_transactions_idempotency_key_uq
  on public.credit_transactions (idempotency_key)
  where idempotency_key is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA
-- ═══════════════════════════════════════════════════════════════════════════

create table public.audit_logs (
  id         bigserial primary key,
  action     text not null,
  table_name text not null,
  user_id    text,
  details    jsonb,
  timestamp  timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────

create index idx_membresias_org        on public.membresias (organization_id);
create index idx_proyectos_org         on public.proyectos (organization_id);
create index idx_propiedades_org       on public.propiedades (organization_id);
create index idx_propiedades_project   on public.propiedades (project_id);
create index idx_media_property        on public.media_assets (property_id);
create index idx_brandkits_org         on public.brand_kits (organization_id);
create index idx_templates_org         on public.ai_templates (organization_id);
create index idx_jobs_org              on public.generation_jobs (organization_id);
create index idx_jobs_status           on public.generation_jobs (status);
create index idx_outputs_job           on public.generation_outputs (generation_id);
create index idx_connections_org       on public.meta_connections (organization_id);
create index idx_campaigns_org         on public.campaigns (organization_id);
create index idx_campaigns_status      on public.campaigns (estado);
create index idx_approvals_campaign    on public.campaign_approvals (campaign_id);
create index idx_insights_campaign     on public.insights_snapshots (campaign_id);
create index idx_leads_org             on public.leads (organization_id);
create index idx_leads_campaign        on public.leads (campaign_id);
create index idx_leads_provider        on public.leads (organization_id, provider_lead_id);
create index idx_subscriptions_org     on public.suscripciones (organization_id);
create index idx_transactions_org      on public.credit_transactions (organization_id);
create index idx_transactions_wallet   on public.credit_transactions (wallet_id);

-- ── updated_at automáticos ──────────────────────────────────────────────────

create trigger trg_generation_jobs_updated before update on public.generation_jobs
  for each row execute function public.set_updated_at();

create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function public.set_updated_at();

create trigger trg_wallets_updated before update on public.credit_wallets
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (multi-tenant, §15)
-- El backend usa la service role (salta RLS); las políticas protegen el
-- acceso directo desde el navegador con el JWT del usuario.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.organizaciones     enable row level security;
alter table public.usuarios           enable row level security;
alter table public.membresias         enable row level security;
alter table public.proyectos          enable row level security;
alter table public.propiedades        enable row level security;
alter table public.media_assets       enable row level security;
alter table public.brand_kits         enable row level security;
alter table public.ai_templates       enable row level security;
alter table public.model_registry     enable row level security;
alter table public.generation_jobs    enable row level security;
alter table public.generation_outputs enable row level security;
alter table public.meta_connections   enable row level security;
alter table public.campaigns          enable row level security;
alter table public.campaign_approvals enable row level security;
alter table public.insights_snapshots enable row level security;
alter table public.leads              enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.suscripciones      enable row level security;
alter table public.credit_wallets     enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.audit_logs         enable row level security;

-- Organizaciones: el usuario ve las suyas.
create policy organizaciones_select on public.organizaciones
  for select using (public.is_member(organization_id));

-- Membresías: cada usuario ve las suyas; el rol gestiona el resto.
create policy membresias_select on public.membresias
  for select using (user_id = auth.uid() or public.is_member(organization_id));

-- Usuarios: visibles para quien comparte organización.
create policy usuarios_select on public.usuarios
  for select using (
    exists (
      select 1 from public.membresias m1
      join public.membresias m2 on m1.organization_id = m2.organization_id
      where m1.user_id = auth.uid() and m2.user_id = usuarios.user_id and m1.activo
    )
  );

-- Tablas por organización (lectura miembro / escritura con rol).
do $$
declare
  t text;
begin
  foreach t in array array[
    'proyectos', 'propiedades', 'media_assets', 'brand_kits',
    'generation_jobs', 'generation_outputs', 'meta_connections', 'campaigns',
    'campaign_approvals', 'insights_snapshots', 'leads', 'suscripciones',
    'credit_wallets', 'credit_transactions'
  ]
  loop
    execute format('create policy %I_select on public.%I for select using (public.is_member(organization_id))', t, t);
    execute format('create policy %I_write on public.%I for all using (public.can_write(organization_id)) with check (public.can_write(organization_id))', t, t);
  end loop;
end $$;

-- Plantillas del sistema visibles para todos; las propias, solo para su org.
create policy ai_templates_select on public.ai_templates
  for select using (organization_id is null or public.is_member(organization_id));

-- Registro de modelos: lectura para miembros, escritura solo service role.
create policy model_registry_select on public.model_registry
  for select using (auth.uid() is not null);

-- Planes: catálogo público para usuarios autenticados.
create policy plans_select on public.subscription_plans
  for select using (auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEMILLAS — plantillas del sistema, modelos y planes (MVP)
-- ═══════════════════════════════════════════════════════════════════════════

-- Plantillas iniciales por categoría (§07)
insert into public.ai_templates
  (nombre, categoria, objetivo, media_type, formato, variables, estructura_narrativa, movimiento_camara, estilo_visual, prompt_base, requiere_referencia_original, creditos_base)
values
  ('Vuelo aéreo de lotización', 'lotizaciones', 'mensajes', 'video', 'reels_9_16',
   '["nombre_proyecto", "total_lotes", "ubicacion"]',
   'Apertura aérea del proyecto → accesos y perímetro → cierre con llamado a la acción.',
   'Plano cenital suave descendente, sin adiciones al terreno.',
   'Luz natural, presentación inmobiliaria premium, sin texto superpuesto.',
   'Create a cinematic aerial sequence of the verified project area. Preserve terrain, roads and structures exactly as present in the reference. Do not add buildings, amenities or landscaping not present. Smooth camera motion, natural daylight, no text overlays.',
   true, 3),
  ('Recorrido de fachada', 'casas', 'visitas', 'video', 'reels_9_16',
   '["nombre", "fachada_foto", "atributos"]',
   'Fachada completa → detalle de entrada → espacio exterior.',
   'Travelling lateral lento y acercamiento a la entrada.',
   'Realista, luz de tarde, materiales preservados.',
   'Create a realistic slow camera movement from the provided property image. Preserve architecture, geometry, materials and surrounding terrain. Do not add features not present in the reference. Natural daylight, premium real-estate presentation, no text.',
   true, 3),
  ('Recorrido interior', 'departamentos', 'visitas', 'video', 'reels_9_16',
   '["nombre", "ambientes", "vista"]',
   'Entrada → ambientes principales → vista desde balcón.',
   'Recorrido continuo tipo steadicam a altura de ojos.',
   'Interior luminoso, colores neutros.',
   'Create a smooth interior walkthrough from the provided photo. Preserve layout, materials and openings. Do not add furniture or rooms not present. Natural light, realistic motion, no text overlays.',
   true, 3),
  ('Animación de render', 'proyecto_planos', 'branding', 'video', 'feed_1_1',
   '["nombre_proyecto", "etiqueta_conceptual"]',
   'Maqueta conceptual → volumetrías → etiqueta de render conceptual.',
   'Órbita lenta alrededor de la maqueta.',
   'Estilo arquitectónico conceptual, identificación explícita de render.',
   'Animate the provided conceptual render with a slow orbit. Keep the geometry exactly as designed. Label the output as conceptual render in the caption area only if text is enabled.',
   false, 3),
  ('Portada promoción comercial', 'publicidad_comercial', 'formularios', 'image', 'imagen_4_5',
   '["nombre", "precio", "condiciones"]',
   'Fotografía principal → precio verificado → CTA de contacto.',
   null,
   'Comercial, alto contraste, verde de marca solo en acentos.',
   'Create a premium real-estate promotional image from the provided property photo. Preserve the property exactly. Space reserved for verified price and call to action. No invented amenities.',
   true, 1),
  ('Carrusel de marca inmobiliaria', 'marca_inmobiliaria', 'branding', 'image', 'feed_1_1',
   '["nombre_empresa", "proyectos_destacados"]',
   'Marca → proyectos destacados → contacto.',
   null,
   'Editorial, consistente con el brand kit de la organización.',
   'Create a clean editorial image composition for a real-estate brand using the provided assets and brand colors. No invented claims or testimonials.',
   false, 1);

-- Modelos de referencia (el registro es dinámico: §09 y §20)
insert into public.model_registry
  (provider, provider_model_id, nombre, media_type, capabilities, duracion_min_s, duracion_max_s, ratios, quote_creditos, status)
values
  ('higgsfield', 'alibaba/wan-3.0/image-to-video', 'Wan 3.0 Image-to-Video', 'video',
   '{"input": "image_url", "audio": false}', 2, 30, '["9:16", "1:1", "16:9"]', 3, 'activo'),
  ('higgsfield', 'sora/realtime-video', 'Sora Realtime Video', 'video',
   '{"input": "image_url", "audio": false}', 4, 12, '["9:16", "16:9"]', 4, 'experimental'),
  ('higgsfield', 'flux/real-estate-img', 'Flux Real Estate Image', 'image',
   '{"input": "image_url", "max_resolution": "2048"}', null, null, '["4:5", "1:1", "16:9"]', 1, 'activo');

-- Planes propuestos (§16; son hipótesis a validar, no ofertas definitivas)
insert into public.subscription_plans
  (nombre, precio_mensual, propiedades_max, usuarios_max, campanas_max, incluye_lotes_al_mando, analitica)
values
  ('agent', 39, 10, 1, 2, false, 'basica'),
  ('business', 89, 75, 5, 10, true, 'intermedia'),
  ('developer', 149, 300, 15, 30, true, 'avanzada');
