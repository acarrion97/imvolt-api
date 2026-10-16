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

## Multi-tenant y RBAC

- `sessionAuth` valida el token Bearer de Supabase Auth.
- `orgContext` traduce ese usuario a su fila local en `usuarios` (por email) y
  resuelve `req.organizationId` (empresa activa; el header `X-Empresa-Id` la
  permite alternar) y `req.orgRole` (primer rol asignado en `roles_usuarios`).
- `filterByEmpresa` / `assignEmpresaOnCreate` acotan listados y creaciones de
  `usuarios` y `propiedades` a la empresa del token (RF-01 / P0).
- `requireRole(...roles)` implementa RBAC con los roles sembrados en `roles`:
  `propietario`, `administrador`, `marketing`, `agente`, `lector`.
- RLS habilitado sin políticas permisivas en `schema.sql`: el navegador nunca
  toca la base directamente, todo pasa por el API (service role key).

## Módulos y rutas

| Módulo | Rutas | Contenido |
|--------|-------|-----------|
| Auth | `/api/auth` | register (cuenta + empresa + usuario + rol propietario), login, me |
| Identity | `/api/v1/empresas`, `/usuarios`, `/roles`, `/permisos`, `/roles-usuarios`, `/roles-permisos`, `/hitos-lanzamiento`, `/empresas-hitos`, `/configuraciones-integraciones`, `/empresas-integraciones` | Tenant, usuarios y RBAC (10 recursos) |
| Property | `/api/v1/propiedades`, `/tipos-propiedad` | Catálogo de inmuebles |
| Creative | `/api/v1/plantillas`, `/tipos-plantilla`, `/formatos`, `/enfoques-comerciales`, `/contenidos-ia` | Estudio IA |
| Advertising | `/api/v1/objetivos-publicidad`, `/campanias-publicitarias` | Campañas publicitarias |
| Leads | `/api/v1/contactos` | Prospectos captados |

Cada módulo CRUD expone `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`
y `DELETE /:id`, con filtros por querystring (`?campo=valor&limite=20&pagina=1`).
Los 20 recursos CRUD corresponden 1:1 a los modelos de `src/models/` y a las
tablas del diagrama relacional (`database/schema.sql`).

### Respuestas con subobjetos de llaves foráneas

Cada recurso con FK devuelve además el objeto relacionado incrustado (además de
los ids planos, que siguen siendo el contrato de escritura):

| Recurso | Subobjetos incrustados |
|---------|------------------------|
| `usuario` | `empresa` |
| `roles-usuarios` | `usuario` (con su `empresa`), `rol` |
| `roles-permisos` | `rol`, `permiso` |
| `empresas-hitos` | `empresa`, `hito_lanzamiento` |
| `empresas-integraciones` | `empresa`, `integracion`, `configuracion_integracion` |
| `propiedad` | `empresa`, `tipo_propiedad` |
| `plantilla` | `tipo_plantilla` |
| `contenido-ia` | `propiedad` (con `empresa` y `tipo_propiedad`), `plantilla`, `formato`, `enfoque_comercial` |
| `campania-publicitaria` | `propiedad` (con `empresa` y `tipo_propiedad`), `objetivo_publicidad` |
| `contacto` | `propiedad` (con `empresa` y `tipo_propiedad`) |

Cómo funciona:

- `createCrudRouter({ joins: ['empresas(*)'] })` le pasa las relaciones al
  `BaseService`, que las agrega a cada `SELECT` con la sintaxis PostgREST
  (soporta anidamiento, p. ej. `propiedades(*, empresas(*))`).
- El objeto incrustado llega con el nombre de la **tabla** foránea (`empresas`,
  `tipos_propiedades`); el **Resource** lo renombra a singular (`empresa`,
  `tipo_propiedad`) y formatea cada nivel con su propio resource.
- Si la relación no se puede resolver (o es nullable y viene vacía), el campo
  va en `null`.
- Cada modelo con FK tiene un **modelo de vista** `XxxView` en la misma carpeta
  de dominio (`UsuarioView`, `PropiedadView`, `ContenidoIaView`, …) que describe
  la forma exacta de la respuesta, con los campos relacionados.

> El módulo `catálogo` (proyectos / media / brand kits del documento maestro)
> fue retirado del API: solo existía como referencia del patrón CRUD.

### Flujo de generación IA (§09) — adaptadores listos, endpoints pendientes

El módulo CRUD `contenidos_ia` ya está publicado. El flujo de ejecución con
Higgsfield vive en `src/services/higgsfield.service.ts` (modo simulado sin API
key) y se expondrá como endpoints de negocio sobre la misma base:

```
POST /creative/generations
  1. cotiza (higgsfieldService.quote)
  2. crea el job            → status: created
  3. reserva créditos       → status: credits_reserved   (ledger, idempotente)
  4. envía al proveedor     → status: queued
GET  /creative/generations/:id     (polling: procesa resultado y concilia créditos)
POST /creative/generations/:id/cancel  (elegible → devuelve créditos)
```

### Flujo de campaña Meta (§10) — adaptador listo, endpoints pendientes

`src/services/meta.service.ts` implementa borrador → validación → aprobación →
publicación PAUSED → insights en modo simulado sin credenciales:

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
#    (21 tablas del diagrama + RLS denegado por defecto + semillas de roles,
#    permisos, tipos de propiedad, plantillas, formatos, enfoques, objetivos,
#    hitos e integraciones)
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
├── docs/            Especificación OpenAPI de los CRUD (componentes,
│                    esquemas con ejemplos y generador de operaciones)
├── middlewares/      sessionAuth, requireRole, tenantScope (empresa)
├── models/           Interfaces por DOMINIO (subcarpetas, como el resto
│   │                 de carpetas del API):
│   ├── identity/     empresa, usuario(+View), rol, permiso, usuario_rol(+View),
│   │                 rol_permiso(+View), hito_lanzamiento, empresa_hito(+View),
│   │                 configuracion_integracion(+View), integracion,
│   │                 empresa_integraciones(+View)
│   ├── property/     propiedad(+View), tipo_propiedad
│   ├── creative/     plantilla(+View), tipo_plantilla, formato,
│   │                 enfoque_comercial, contenido_ia(+View), media (tipos IA)
│   ├── advertising/  campania_publicitaria(+View), objetivo_publicidad,
│   │                 meta (adaptador Meta)
│   ├── leads/        contacto(+View)
│   └── commerce/     credits (créditos, deshabilitado)
├── requests/        Validaciones Joi por dominio (helpers + dominio.*)
├── resources/       Vistas de respuesta por dominio
├── controllers/     Un controlador por módulo (createCrudRouter)
├── routes/          Exposición de routers (+ Swagger de auth)
├── services/        auth, higgsfield, meta, credits, strategist
├── types/           Extensiones de Express (userId, organizationId, orgRole)
└── index.ts         Registro de rutas + fusión de la spec OpenAPI
database/
└── schema.sql       Esquema del diagrama + RLS + semillas
```

## Documentación Swagger

`/documentacion` combina dos fuentes:

1. **Comentarios `@swagger`** en `src/routes/auth.route.ts` (endpoints de negocio).
2. **Spec generada** en `src/docs/`: `schemas.ts` declara cada entidad una vez
   (modelo + ejemplo realista) y `crud-paths.ts` genera las 6 operaciones de
   cada recurso con parámetros, `$ref`, ejemplos y respuestas de error
   (`400` validación, `401` sesión, `403` rol, `404` no encontrado).

Para agregar un recurso al documento solo hay que añadir su esquema en
`src/docs/schemas.ts` y su módulo en `src/docs/index.ts`.

## Cómo crear un módulo nuevo

1. `src/models/<dominio>/<tabla>.model.ts` → interfaz de la tabla (+ `BaseModel`)
   y, si tiene FK, su modelo de vista `XxxView` con los subobjetos.
2. `src/requests/<dominio>.request.ts` → `buildSchemas(shape, { required, defaults })`.
3. `src/resources/<dominio>.resource.ts` → `new BaseResource(row => ({...}))`,
   incluyendo los subobjetos FK (`row.empresas ? empresaResource.format(row.empresas) : null`).
4. `src/controllers/<dominio>.controller.ts` → `createCrudRouter({ table, primaryKey, joins, request, resource, middlewares: [...requireOrg], writeMiddlewares: [writeByOwnerOrAdmin | writeByMarketing] })`.
   El `joins` lista las tablas foráneas a incrustar (sintaxis PostgREST).
5. `src/routes/<dominio>.route.ts` → exporta los routers y `src/index.ts` los monta.
6. Documentación: esquema en `src/docs/schemas.ts` (+ `relations` si tiene FK) y
   módulo en `src/docs/index.ts` (genera las 6 operaciones con ejemplos).
7. Tabla e índices en `database/schema.sql` (agregarla a la lista del bloque
   `do $$ ... $$` de RLS).

## Contexto de marca

IMVOLT — MARKETING INMOBILIARIO AI. Esta API sostiene IMVOLT Studio (contenido
IA), IMVOLT Ads (campañas Meta), IMVOLT Pulse (analítica) e IMVOLT Connect
(integraciones). El producto no garantiza ventas: aumenta la capacidad de
producción y la disciplina comercial.
