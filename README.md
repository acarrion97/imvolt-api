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
  resuelve el contexto de la petición:
  - `req.organizationId` — empresa activa (tenant). `usuarios.empresa_id` es
    único en el diagrama, así que el header `X-Empresa-Id` solo puede
    **confirmar** la empresa propia: cualquier otro valor (o un usuario sin
    empresa) responde 403.
  - `req.orgRole` / `req.orgRoles` — el primer rol y **todos** los roles activos
    del usuario en `roles_usuarios`.
  - `req.permissions` — unión de los permisos activos de esos roles
    (`roles_permisos` → `permisos`).
- `filterByEmpresa` / `assignEmpresaOnCreate` acotan listados y creaciones de
  `usuarios` y `propiedades` a la empresa del token (RF-01 / P0).
- `requireRole(...roles)` implementa RBAC con los roles sembrados en `roles`:
  `propietario`, `administrador`, `marketing`, `agente`, `lector`. Valora
  **todos** los roles del usuario, no solo el primero.
- `requirePermission(...permisos)` implementa el RBAC **fino** sobre
  `roles_permisos` (catálogo: `gestionar_usuarios`, `gestionar_propiedades`,
  `crear_contenidos`, `gestionar_campanas`, `ver_analitica`,
  `gestionar_integraciones`). El rol `propietario` es superusuario y hereda
  todos los permisos, de modo que la empresa nunca se queda sin administración
  aunque `roles_permisos` esté vacía.
- `GET /api/auth/me` devuelve además `permisos[]`, que el frontend usa para
  habilitar o no las acciones de gestión.
- RLS habilitado sin políticas permisivas en `schema.sql`: el navegador nunca
  toca la base directamente, todo pasa por el API (service role key).

### Gestión de equipo (miembros, roles y alta por invitación)

Sobre el CRUD genérico de `usuarios` y `roles-usuarios`, el módulo añade las
reglas de administración de un equipo real (`services/miembros.service.ts`):

- **`POST /api/v1/usuarios/invitaciones`** — alta de miembro dentro de la empresa
  activa: crea la credencial en Supabase Auth con una **contraseña temporal**
  (vigencia de 7 días), la fila local en `usuarios` y su rol. Requiere
  propietario/administrador con el permiso `gestionar_usuarios`. Como aún no
  hay servicio de correo, la contraseña temporal se devuelve en la respuesta
  para que el invitante la comparta; queda marcada en la bitácora como `INVITE`
  (nunca en claro).
- **Asignaciones acotadas y sin duplicados**: asignar un rol exige que el
  usuario pertenezca a la empresa activa (si no, 404 sin filtrar existencia),
  que el rol exista, esté activo y sea del catálogo §13, y que no tenga ya ese
  rol (409 en lugar del error del constraint unique). El mismo criterio aplica
  al cambiar un rol existente.
- **Baja lógica**: `PATCH /api/v1/usuarios/:id {estado: 'inactivo'}` revoca el
  acceso (las siguientes peticiones de ese usuario responden 403), y
  `PATCH /api/v1/roles-usuarios/:id {estado: 'inactivo'}` revoca un rol sin
  borrar el vínculo.
- **Sin auto-bloqueo**: no puedes borrarte ni desactivarte a ti mismo, la
  empresa no se puede quedar sin un propietario activo (ni borrando usuarios ni
  revocando su rol) y la empresa no se mueve por `PATCH` (el cambio de tenant
  es dar de baja aquí e invitar en la otra).

### Auditoría (`audit_logs`)

Toda escritura del API deja traza en la bitácora `audit_logs`:

- **Quién**: `auth_user_id` (UUID de Supabase Auth) y `usuario_id` (fila local en
  `usuarios`); **dónde**: `empresa_id` (tenant activo).
- **Qué**: `accion` (`CREATE` / `UPDATE` / `DELETE` / `REGISTER` / `LOGIN` /
  `INVITE`), `tabla` y `registro_id`. En `DELETE` se guarda además el contenido
  previo de la fila (`detalles.antes`); en `REGISTER`/`LOGIN`, el alta de cuenta
  y el inicio de sesión; en `INVITE`, el alta de un miembro por invitación.
- **Nunca rompe la operación**: `services/audit.service.ts` es mejor-esfuerzo; si la
  tabla no existe (esquema sin desplegar) se avisa una sola vez y se deshabilita.
- **Nunca persiste credenciales**: los campos sensibles (`password`, `api_key`,
  `app_secret`, `access_token`…) se enmascaran como `••••` antes de guardarlos.
- **Lectura restringida**: `GET /api/v1/auditoria` (y `GET /:id`) es de solo
  lectura, acotado a la empresa del token y visible solo para `propietario` y
  `administrador`, con filtros `?tabla=&accion=&usuario_id=`.

## Módulos y rutas

| Módulo | Rutas | Contenido |
|--------|-------|-----------|
| Auth | `/api/auth` | register (cuenta + empresa + usuario + rol propietario), login, me |

> `POST /api/auth/login` usa un **cliente Supabase aislado**
> (`supabaseAuthSession` en `src/config/supabaseClient.ts`): `signInWithPassword`
> deja la sesión del usuario en la memoria del cliente y supabase-js enviaría
> ese JWT en cada consulta PostgREST, ejecutándolas con el rol `authenticated`
> (que `schema.sql` revoca) y respondiendo `permission denied`. El cliente
> principal nunca tiene sesión y sigue viajando siempre con la service role key.
| Identity | `/api/v1/empresas`, `/usuarios` (+ `/usuarios/invitaciones`), `/roles`, `/permisos`, `/roles-usuarios`, `/roles-permisos`, `/hitos-lanzamiento`, `/empresas-hitos`, `/configuraciones-integraciones`, `/empresas-integraciones`, `/auditoria` | Tenant, miembros del equipo, RBAC y bitácora (10 recursos CRUD + auditoría de solo lectura + invitación de miembros) |
| Property | `/api/v1/propiedades`, `/tipos-propiedad` | Catálogo de inmuebles (vinculables a un proyecto) |
| Catalog | `/api/v1/proyectos`, `/api/v1/media-assets` | Proyectos inmobiliarios y media assets (bucket privado con versiones) |
| Creative | `/api/v1/plantillas`, `/tipos-plantilla`, `/formatos`, `/enfoques-comerciales`, `/contenidos-ia` | Estudio IA |
| Advertising | `/api/v1/objetivos-publicidad`, `/campanias-publicitarias` | Campañas publicitarias |
| Leads | `/api/v1/contactos` | Prospectos captados |
| Brand Kit | `/api/v1/brand-assets`, `/api/v1/brand-colors` | Identidad de marca: archivos con versiones en bucket privado y colores de la paleta |

Cada módulo CRUD expone `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`
y `DELETE /:id`, con filtros por querystring (`?campo=valor&limite=20&pagina=1`).
Los 24 recursos CRUD corresponden 1:1 a los modelos de `src/models/` y a las
tablas del diagrama relacional (`database/schema.sql`).

### Respuestas con subobjetos de llaves foráneas

Cada recurso con FK devuelve además el objeto relacionado incrustado (además de
los ids planos, que siguen siendo el contrato de escritura):

| Recurso | Subobjetos incrustados |
|---------|------------------------|
| `usuario` | `empresa` (+ `roles`: array de nombres de sus roles activos, calculado) |
| `roles-usuarios` | `usuario` (con su `empresa`), `rol` |
| `roles-permisos` | `rol`, `permiso` |
| `empresas-hitos` | `empresa`, `hito_lanzamiento` |
| `empresas-integraciones` | `empresa`, `integracion`, `configuracion_integracion` |
| `propiedad` | `empresa`, `tipo_propiedad`, `proyecto` (referencia ligera, nullable) |
| `proyecto` | `empresa` (+ `propiedades_count` y `media_assets_count`, calculados) |
| `media-asset` | `empresa`, `version_activa`, `proyecto` y `propiedad` (referencias ligeras, nullable) |
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

> El módulo **Catálogo** (`/api/v1/proyectos` y `/api/v1/media-assets`) está
> implementado: proyectos inmobiliarios con sus propiedades y medios, siguiendo
> el patrón Brand Kit para el storage (ver abajo).

### Brand Kit — archivos con storage y URL firmada

`/api/v1/brand-assets` es un CRUD de metadatos con rutas propias de storage y
`/api/v1/brand-colors` gestiona la paleta de la empresa:

| Ruta | Qué hace |
|------|----------|
| `POST /brand-assets/:id/versiones` | `multipart/form-data` con el campo `archivo` (+ `nota`): sube una versión y la deja activa |
| `GET /brand-assets/:id/versiones` | Historial de versiones (más reciente primero) |
| `GET /brand-assets/:id/descarga` | URL firmada de la versión activa (5 minutos) |
| `GET /brand-assets/:id/versiones/:vid/descarga` | URL firmada de una versión puntual |
| `POST /brand-assets/:id/versiones/:vid/restaurar` | Devuelve el archivo a esa versión |
| `DELETE /brand-assets/:id/versiones/:vid` | Borra fila + blob; si era la activa, activa la más reciente restante |
| `DELETE /brand-assets/:id` | Borra los blobs, el historial y el archivo |

- **Bucket privado** `brand-kit` (`src/services/brandkit.storage.ts`): la API lo
  crea o ajusta al arrancar (`asegurarBucket`) con `file_size_limit` de **10 MB**
  y `allowed_mime_types` del catálogo.
- **Límites y tipos**: `validarArchivo` responde `413` (supera 10 MB), `400`
  (archivo vacío) y `415` (tipo no permitido para la categoría). Si el navegador
  no reporta el MIME (fuentes `.woff2`/`.otf`) se deduce de la extensión.
  El frontend repite exactamente la misma validación en
  `imvolt/src/domain/brand-kit` solo para anticipar el error.
- **URL firmada**: el bucket jamás es público; toda lectura pasa por
  `GET .../descarga`, que valida sesión + tenant y devuelve una URL de 300 s
  (`BrandAssetDescarga`). La ruta interna (`ruta_storage`) no sale del API.
- **Multiempresa**: `empresa_id` se fuerza desde la sesión en lecturas
  (`filterByEmpresa`) y escrituras (`empresaEnEscritura`), con
  `tenantScoped/tenantColumn` para responder 404 ante registros ajenos.
- **Auditoría**: subidas, restauraciones y borrados dejan traza en `audit_logs`.

### Catálogo — proyectos inmobiliarios y media assets

`/api/v1/proyectos` agrupa las propiedades de un desarrollo (`lotizacion`,
`urbanizacion`, `edificio`, `proyecto_planos`, `individual`) y
`/api/v1/media-assets` gestiona los medios finales de la empresa (fotos,
renders, videos, documentos), siguiendo el mismo patrón de storage que el
Brand Kit:

| Ruta | Qué hace |
|------|----------|
| `GET/POST/PUT/PATCH/DELETE /proyectos` | CRUD de proyectos (acotado a empresa) |
| `GET/POST/PUT/PATCH/DELETE /media-assets` | CRUD de metadatos del medio |
| `POST /media-assets/:id/versiones` | `multipart/form-data` con el campo `archivo` (+ `nota` opcional): sube una versión y la deja activa |
| `GET /media-assets/:id/versiones` | Historial de versiones (más reciente primero) |
| `GET /media-assets/:id/descarga` | URL firmada de la versión activa (5 minutos) |
| `GET /media-assets/:id/versiones/:vid/descarga` | URL firmada de una versión puntual |
| `POST /media-assets/:id/versiones/:vid/restaurar` | Devuelve el medio a esa versión |
| `DELETE /media-assets/:id/versiones/:vid` | Borra fila + blob; si era la activa, activa la más reciente restante |
| `DELETE /media-assets/:id` | Borra los blobs, el historial y el medio |

- **Bucket privado** `media-assets` (`src/services/media.storage.ts`): la API
  lo crea o ajusta al arrancar (`asegurarBucket`) con `file_size_limit` de
  **100 MB** (frente a los 10 MB del Brand Kit) y `allowed_mime_types` del
  catálogo. `validarArchivo` responde `413` / `400` / `415` según el caso.
- **El medio es solo metadatos**: el blob vive en Storage y cada subida crea
  una fila en `media_asset_versions` (número correlativo). `version_activa_id`
  apunta a la versión que se sirve; `ruta_storage` jamás sale del API.
- **URL firmada**: toda lectura pasa por `GET .../descarga`, que valida sesión
  + tenant y devuelve una URL de 300 s.
- **Vínculo proyecto ↔ propiedad**: `propiedades.proyecto_id` es una FK
  nullable (`on delete set null`), así que una propiedad puede ser individual.
  `media_assets` puede apuntar además a un proyecto y/o a una propiedad.
- **Referencias ligeras**: `proyecto` dentro de `propiedad` y de `media-asset`
  (y `propiedad` dentro de `media-asset`) se sirven como referencia ligera
  (id, nombre, tipo/ubicacion), no como subárbol completo: el proyecto con su
  empresa está en `/proyectos` y la propiedad completa en `/propiedades`.
- **Permisos y tenant**: proyectos escriben con `writeByOwnerOrAdmin` y medios
  con `writeByMarketing`; ambos acotan lecturas (`filterByEmpresa`) y fuerzan
  `empresa_id` en escritura (`empresaEnEscritura`), con `tenantScoped` para
  responder 404 ante registros ajenos. Auditoría en todas las escrituras.

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
#    (28 tablas del diagrama + buckets privados `brand-kit` y `media-assets` +
#    RLS denegado por defecto + semillas de roles, permisos, tipos de
#    propiedad, plantillas, formatos, enfoques, objetivos, hitos e integraciones)
#    Si propiedades ya existe y el API reporta que no hay relación con
#    proyectos, ejecuta database/migrations/20261026_add_propiedades_proyecto_fk.sql.
#    La migración añade la FK faltante y solicita recargar la caché de PostgREST.
# 2. Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env

npm run dev               # desarrollo (ts-node)
npm run build             # compila a dist/
npm start                 # node dist/index.js
```

Documentación Swagger: `http://localhost:3000/documentacion`
Salud del servicio: `GET /api/health`

## Seguridad en producción

- Termina TLS en un proxy inverso administrado (TLS 1.2 o superior) y sirve
  tanto la aplicación como la API mediante HTTPS. El proxy debe sobrescribir,
  no conservar, los encabezados `Forwarded` / `X-Forwarded-*` recibidos del
  cliente.
- Define `NODE_ENV=production`, `TRUST_PROXY_HOPS` con el número exacto de
  proxies confiables y `ALLOWED_ORIGIN` con los orígenes HTTPS del frontend.
  La API exige al menos un salto confiable y rechaza solicitudes que Express
  no reconozca como seguras. No expongas el puerto de Node directamente a
  Internet: limita el acceso de red al proxy configurado, ya que la confianza
  en encabezados reenviados depende de ello.
- Inyecta `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y las demás credenciales
  desde el gestor de secretos del entorno de ejecución; no las guardes en el
  repositorio, imágenes, logs ni configuración del frontend. La clave service
  role es exclusiva del servidor y omite RLS, por lo que el API debe aplicar
  autorización y alcance de tenant en cada endpoint.
- Restringe el acceso al gestor de secretos a la identidad de despliegue/API
  que lo necesite. Rota inmediatamente las claves ante exposición y programa
  su rotación periódica; actualiza el secreto en el runtime y revoca la clave
  anterior después de verificar el despliegue.
- El navegador solo recibe configuración pública (por ejemplo,
  `VITE_API_URL`) y credenciales de sesión del usuario. No publiques secretos
  compartidos mediante variables `VITE_*`.

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
│   ├── catalog/      proyecto, media_asset(+View), media_asset_version
│   ├── property/     propiedad(+View), tipo_propiedad
│   ├── creative/     plantilla(+View), tipo_plantilla, formato,
│   │                 enfoque_comercial, contenido_ia(+View), media (tipos IA)
│   ├── advertising/  campania_publicitaria(+View), objetivo_publicidad,
│   │                 meta (adaptador Meta)
│   ├── leads/        contacto(+View)
│   ├── brandkit/     brand_asset(+View), brand_asset_version, brand_color(+View)
│   └── commerce/     credits (créditos, deshabilitado)
├── requests/        Validaciones Joi por dominio (helpers + dominio.*)
├── resources/       Vistas de respuesta por dominio
├── controllers/     Un controlador por módulo (createCrudRouter)
├── routes/          Exposición de routers (+ Swagger de auth, identidad,
│                    Brand Kit y Catálogo)
├── services/        auth, audit, miembros (invitación + guardas de equipo),
│                    higgsfield, meta, credits, strategist,
│                    brandkit.storage y media.storage (buckets privados +
│                    URL firmada)
├── types/           Extensiones de Express (userId, organizationId, orgRole, orgRoles, permissions)
└── index.ts         Registro de rutas + fusión de la spec OpenAPI
database/
└── schema.sql       Esquema del diagrama + RLS + semillas
```

## Documentación Swagger

`/documentacion` combina dos fuentes:

1. **Comentarios `@swagger`** en `src/routes/auth.route.ts`,
   `src/routes/brandkit.route.ts` y `src/routes/catalog.route.ts` (endpoints de
   negocio).
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
