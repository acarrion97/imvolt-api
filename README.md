# IMVOLT API — MARKETING INMOBILIARIO AI

API de la plataforma SaaS de marketing inmobiliario asistida por IA: de la
propiedad al anuncio, para desarrolladores, inmobiliarias y agentes.

Construida sobre la plantilla **backend-ts** (TypeScript + Express + Supabase,
MVC con CRUD genérico) y adaptada al alcance del **Documento Maestro IMVOLT v3**.

## Arquitectura

```
Petición HTTP
     │
     ▼
 ┌──────────┐  valida + payload  ┌──────────┐  consulta  ┌───────────┐
 │ Request  │ ─────────────────▶ │ Service  │ ─────────▶ │ Supabase  │
 │  (Joi)   │                    │  (CRUD)  │            │ (Postgres)│
 └──────────┘                    └────┬─────┘            └─────┬─────┘
                                      │ fila cruda             │
                                      ▼                         │
                                ┌───────────┐  formatea         │
                                │ Resource  │ ◀─────────────────┘
                                └─────┬─────┘
                                      ▼
                                   Response
```

| Capa | Carpeta | Responsabilidad |
|------|---------|-----------------|
| Request | `src/requests/` | Valida con Joi y devuelve el payload limpio |
| Service | `src/core/base.service.ts` + `src/services/` | CRUD genérico + lógica de negocio (Higgsfield, Meta, créditos, estratega) |
| Resource | `src/resources/` | Forma exacta de la respuesta |
| Controller | `src/controllers/` | Orquesta el flujo y maneja códigos HTTP |
| Routes | `src/routes/` | Rutas + documentación Swagger |

## Multi-tenant y seguridad (§15 del documento maestro)

- `sessionAuth` valida el token Bearer de Supabase Auth.
- `orgContext` resuelve la organización activa (`X-Org-Id` o la primera membresía).
- `filterByOrg` / `assignOrgOnCreate` acotan listados y creaciones.
- `tenantScoped` en el factory impide leer/editar/eliminar registros de otra
  organización (responde 404 sin filtrar su existencia — RF-01 / P0).
- `requireRole(...roles)` implementa RBAC: `propietario`, `administrador`,
  `marketing`, `agente`, `lector`.
- RLS en el esquema SQL protege el acceso directo desde el navegador.

## Módulos y rutas

| Módulo | Rutas | Contenido |
|--------|-------|-----------|
| Auth | `/api/auth` | register (cuenta + org + membresía + wallet), login, me |
| Identity | `/api/v1/organizaciones`, `/membresias`, `/usuarios` | Tenants, usuarios y roles |
| Catalog | `/api/v1/proyectos`, `/propiedades`, `/media`, `/brand-kits` | Catálogo inmobiliario (RF-02, RF-03) |
| Creative | `/api/v1/plantillas`, `/modelos`, `/creative/generations`, `/strategist` | Estudio IA (RF-04, RF-05, RF-06) |
| Advertising | `/api/v1/conexiones`, `/campaigns` | Borradores, aprobación, publicación PAUSED, insights (RF-07, RF-08) |
| Commerce | `/api/v1/planes`, `/suscripciones`, `/billing` | Planes, suscripciones y ledger de créditos (RF-06) |
| Leads | `/api/v1/leads` | Prospectos captados (RF-10) |

Cada módulo CRUD expone `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`
y `DELETE /:id`, con filtros por querystring (`?campo=valor&limite=20&pagina=1`).

### Flujo de generación IA (§09)

```
POST /creative/generations
  1. cotiza (higgsfieldService.quote)
  2. crea el job            → status: created
  3. reserva créditos       → status: credits_reserved   (ledger, idempotente)
  4. envía al proveedor     → status: queued
GET  /creative/generations/:id     (polling: procesa resultado y concilia créditos)
POST /creative/generations/:id/cancel  (elegible → devuelve créditos)
```

### Flujo de campaña Meta (§10)

```
POST /campaigns                    → local_draft
POST /campaigns/:id/validate       → validated   (incluye reglas de vivienda)
POST /campaigns/:id/approve        → approved    (solo propietario/administrador)
POST /campaigns/:id/publish        → published_paused (recursos en PAUSED)
GET  /campaigns/:id/insights       → gasto, impresiones, clics, leads, CPL, CTR
GET  /campaigns/:id/export         → paquete manual mientras los permisos no estén listos
```

Cualquier cambio en presupuesto, destino, objetivo o creativo **invalida la
aprobación** y devuelve la campaña a `local_draft`.

## Proveedores en modo simulado

Sin credenciales la API es completamente funcional en modo simulado:

| Variable | Efecto |
|----------|--------|
| `HIGGSFIELD_SIMULATE=true` (o sin API key) | Jobs simulados con latencia y resultado de demostración |
| `META_SIMULATE=true` (o sin Meta App) | Borradores, aprobación y "publicación" con IDs simulados |

El navegador **nunca** recibe claves de Higgsfield ni tokens de Meta (§12).

## Puesta en marcha

```bash
cp .env.example .env      # en Windows: copy .env.example .env
npm install

# 1. Ejecuta database/schema.sql en el SQL Editor de Supabase
#    (incluye RLS y semillas: plantillas, modelos y planes)
# 2. Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env

npm run dev               # desarrollo (ts-node)
npm run build             # compila a dist/
npm start                 # node dist/index.js
```

Documentación Swagger: `http://localhost:3000/documentacion`
Salud del servicio: `GET /api/health`

## Estructura

```
src/
├── config/          global.ts, supabaseClient.ts
├── core/            Núcleo MVC genérico (base.* + crud.factory + errors)
├── middlewares/     sessionAuth, requireRole, tenantScope
├── models/          Interfaces por dominio (identity, catalog, creative,
│                    advertising, commerce, lead)
├── requests/        Validaciones Joi por dominio
├── resources/       Vistas de respuesta por dominio
├── controllers/     Un controlador por módulo
├── routes/          Rutas + Swagger por módulo
├── services/        auth, higgsfield, meta, credits, strategist
├── types/           Extensiones de Express (userId, organizationId, orgRole)
└── index.ts         Registro de rutas y arranque
database/
└── schema.sql       Esquema completo + RLS + semillas
```

## Cómo crear un módulo nuevo

1. `src/requests/<dominio>.request.ts` → `new BaseRequest({ create, update })`.
2. `src/resources/<dominio>.resource.ts` → `new BaseResource(row => ({...}))`.
3. `src/controllers/<dominio>.controller.ts` → `createCrudRouter({ table, primaryKey, request, resource, middlewares: [...requireOrg, filterByOrg], writeMiddlewares: [..., assignOrgOnCreate], tenantScoped: true })`.
4. Documenta con Swagger en `src/routes/<dominio>.route.ts` y registra el
   router en `src/index.ts`.
5. Crea las tablas e índices en `database/schema.sql` (agrega la tabla a la
   lista de políticas RLS del bloque `do $$ ... $$`).

## Contexto de marca

IMVOLT — MARKETING INMOBILIARIO AI. Esta API sostiene IMVOLT Studio (contenido
IA), IMVOLT Ads (campañas Meta), IMVOLT Pulse (analítica) e IMVOLT Connect
(integraciones). El producto no garantiza ventas: aumenta la capacidad de
producción y la disciplina comercial.
