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

## Seguridad (HTTPS/TLS, secretos y mínimos privilegios)

### HTTPS / TLS
- El API **no termina TLS**: va detrás de un balanceador/proxy (Render, Fly, Nginx, Vercel…) que sí lo hace. Con `NODE_ENV=production`, `trust proxy` es `1` salto (ajústalo con `TRUST_PROXY`) y toda petición que no llegue por HTTPS (`X-Forwarded-Proto: https`) se rechaza: `GET/HEAD` se redirigen (308) a `PUBLIC_API_URL`; el resto responde `426`. `/api/health` queda exento para las sondas del balanceador. El proxy **debe** sobrescribir `X-Forwarded-Proto` (no reenviar el del cliente).
- `helmet`: HSTS (2 años, `includeSubDomains`, `preload`), CSP `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, sin `X-Powered-By`. Swagger UI (`/documentacion`) lleva todas las cabeceras salvo la CSP. Las respuestas de `/api` llevan `Cache-Control: no-store`.
- CORS: lista blanca exacta en `ALLOWED_ORIGIN` (el arranque falla con `*`, rutas o, en producción, orígenes sin `https`; una `/` final se ignora). `credentials` está deshabilitado: **la API no emite cookies**; la sesión viaja en `Authorization: Bearer`, por lo que no aplican `HttpOnly/Secure/SameSite` ni CSRF. Si se añaden cookies de sesión, deben ir `HttpOnly; Secure; SameSite=Lax|Strict` y habrá que activar `credentials` solo para los orígenes de la lista.
- Rate limiting por IP: `POST /api/auth/login` (10 / 15 min) y `POST /api/auth/register` (5 / 15 min) → `429`.

### Secretos
- Al arrancar se validan las variables (`src/config/env.ts`) y el proceso **aborta** listando qué variable falla y por qué, sin imprimir valores. Siempre: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (forma de clave válida). En producción además: `SUPABASE_ANON_KEY`, `ALLOWED_ORIGIN` con `https`, y credenciales Higgsfield/Meta si se desactiva su simulación.
- La **service role key** vive solo en `src/config/supabaseClient.ts` (DB, Storage y `auth.admin`, todo del lado servidor). El login usa la clave anon con un cliente nuevo por intento.
- Los errores 5xx y los no controlados devuelven `{"message":"Error interno del servidor"}`; el detalle (mensajes de Supabase/PostgREST) solo se registra en el servidor. Las credenciales de integraciones se devuelven enmascaradas (`••••`) y la bitácora redacta claves/tokens.
- `.env` y `.env.*` están en `.gitignore` (excepto `.env.example`, que no contiene valores reales). **Rota** cualquier clave que alguna vez se haya pegado en un chat, ticket o commit.

### Mínimos privilegios
- Toda ruta `/api/v1/*` exige sesión + empresa + al menos un rol activo (`requireOrg`). Lectura: cualquier rol; escritura: `propietario/administrador` (propiedades, proyectos, usuarios) o `+marketing` (creativo, campañas, leads, brand kit, media), y permiso fino donde aplica (`gestionar_usuarios`, `gestionar_integraciones`).
- Aislamiento por empresa: todas las tablas con datos de cliente se acotan a la empresa de la sesión (listado, lectura, edición y borrado por id → `404` si es ajeno; fail-closed si el dueño no se puede resolver). `empresa_id` del body se ignora y se sobrescribe con el de la sesión; las FK enviadas (`propiedad_id`, `proyecto_id`, `configuracion_integracion_id`) deben pertenecer a la empresa.
- Catálogos **globales** (roles, permisos, roles-permisos, hitos, tipos, formatos, plantillas, enfoques, objetivos): lectura para todos; escritura solo para los correos de `PLATFORM_ADMIN_EMAILS`.
- Solo un `propietario` puede asignar/revocar el rol `propietario`.
- Storage: buckets privados; la descarga devuelve **solo URL firmadas de 300 s**; subir, restaurar y borrar versiones exige rol de escritura.

### Variables nuevas
| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | — | `production` activa HTTPS obligatorio, validación estricta y docs cerradas |
| `SUPABASE_ANON_KEY` | producción | Clave anon/publishable para el login |
| `PUBLIC_API_URL` | recomendada | Origen https del API (destino del redirect 308 y `servers` de Swagger) |
| `TRUST_PROXY` | — | Saltos de proxy de confianza (def. `1` en producción) |
| `ENABLE_DOCS` | — | `true` abre `/documentacion` en producción |
| `PLATFORM_ADMIN_EMAILS` | — | Correos que pueden escribir catálogos globales |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` / `_LOGIN_MAX` / `_REGISTER_MAX` | — | Ventana y topes del rate limit |

### Migración requerida
Ejecuta `database/migrations/2026-10-26_tenant_hardening.sql` **antes** de desplegar: añade `empresa_id` a `contactos` y `configuraciones_integraciones`. Las filas que no puedan atribuirse a una empresa quedan invisibles hasta asignarlas a mano.

### Cambios visibles para el frontend
- `POST /api/v1/empresas` y `DELETE /api/v1/empresas/:id` → deshabilitados (404). Las empresas se crean en `/auth/register`.
- Escritura en catálogos globales → `403` salvo `PLATFORM_ADMIN_EMAILS`.
- Usuarios sin rol activo → `403` en `/api/v1/*` (`/api/auth/me` sigue respondiendo).
- `contactos` y `configuraciones-integraciones` incluyen `empresa_id` (campo nuevo, aditivo). Integraciones exigen `gestionar_integraciones` también para leer.
- `limite` se acota a 500; el JSON del body a 1 MB; errores 5xx con mensaje genérico; `429` en login/registro.

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

### Generación IA (§09) — catálogo y endpoints REST

El catálogo se sirve en `GET /api/v1/modelos`; las generaciones se persisten en
`generaciones` y se exponen en `GET/POST /api/v1/creative/generations`. El API
calcula el costo desde el catálogo, valida propiedad/modelo, carga los créditos
y conserva el identificador de proveedor:

```
POST /api/v1/creative/generations      → cotiza, cobra y encola (o completa en simulación)
GET  /api/v1/creative/generations/:id  → consulta/persiste el estado del proveedor
```

En simulación devuelve una generación completada con costo registrado. Con un
proveedor real, `GET` consulta el estado y devuelve los créditos si el job falla.

### Contratos REST de campañas y leads

Para `VITE_DATA_PROVIDER=rest`, `/api/v1/campaigns` y `/api/v1/leads` traducen
los nombres del frontend sobre `campanias_publicitarias` y `contactos`; no
duplican esas entidades. El CRUD heredado `/campanias-publicitarias` y
`/contactos` conserva su contrato del diagrama.

```
GET/POST/PATCH/DELETE /api/v1/campaigns
GET/POST/PATCH/DELETE /api/v1/leads
GET/POST/DELETE       /api/v1/conexiones
```

El CRUD de campaña REST no sustituye el endpoint de publicación en Meta, que
permanece en `/api/v1/campanias-publicitarias/:id/publicar`.

### Créditos (§16)

- `GET /api/v1/billing/wallet`, `GET /api/v1/billing/transactions` y
  `POST /api/v1/billing/recharge` sirven el saldo y el ledger de la empresa.
- La primera wallet recibe 25 créditos de bienvenida, con movimiento
  idempotente. La recarga es un stub y no representa un cobro real.
- Los movimientos de transacciones son de solo lectura para el cliente.

## Proveedores en modo simulado

Sin credenciales la API es completamente funcional en modo simulado:

| Variable | Efecto |
|----------|--------|
| `HIGGSFIELD_SIMULATE=true` (o sin API key) | Jobs simulados con latencia y resultado de demostración |
| `META_SIMULATE=true` (o sin Meta App) | Borradores, aprobación y "publicación" con IDs simulados |

El navegador **nunca** recibe claves de Higgsfield ni tokens de Meta (§12).

### Publicar una campaña en Meta

`POST /api/v1/campanias-publicitarias/:id/publicar` crea la campaña en Meta con el SDK
oficial, **siempre `PAUSED`** y con `special_ad_categories: ['HOUSING']`. Body opcional:
`{ "validar_solo": true }` (Meta valida sin crear nada).

- Rol propietario/administrador/marketing con permiso `gestionar_campanas`.
- Usa la integración **Meta Ads** activa de la empresa: `api_id` = cuenta publicitaria
  (`act_…`) y `access_token` en `configuraciones_integraciones`.
- Con credenciales reales: `META_SIMULATE=false`, `META_APP_ID` y `META_APP_SECRET`.
- Antes de desplegar ejecuta `database/migrations/2026-10-27_meta_campaign_publish.sql`
  (columnas `meta_campaign_id`, `meta_estado`, `publicada_en`).
- Responde 409 si la campaña ya se publicó (o se está publicando); 404 si es de otra empresa.

## Puesta en marcha

```bash
cp .env.example .env      # en Windows: copy .env.example .env
npm install

# 1. Ejecuta database/schema.sql (esquema base, RLS y semillas).
# 2. Ejecuta estas migraciones, en orden, para habilitar contratos REST
#    justificados por el Documento Maestro:
#      migrations/2026-10-27_01_ai_connections.sql
#      migrations/2026-10-27_02_campaign_lead_contract.sql
#      migrations/2026-10-27_03_credit_ledger.sql
#      migrations/2026-10-27_04_campaign_tenant_backfill.sql
#      migrations/2026-10-27_meta_campaign_publish.sql (publicación Meta)
#    Las campañas y leads reutilizan las tablas existentes; no se crean tablas
#    duplicadas para esos recursos.
#    Si propiedades ya existe y falta su FK a proyectos, ejecuta
#    migrations/20261026_add_propiedades_proyecto_fk.sql.
# 3. Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env

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
- Define `NODE_ENV=production`, `TRUST_PROXY` con el número exacto de saltos
  del proxy (por defecto `1` en producción) y `ALLOWED_ORIGIN` con los orígenes
  HTTPS del frontend. Solo entonces Express confía en `X-Forwarded-Proto` /
  `X-Forwarded-For` del proxy y rechaza con `426` las peticiones que no lleguen
  por HTTPS. No expongas el puerto de Node directamente a Internet: limita el
  acceso de red al proxy configurado, ya que la confianza en encabezados
  reenviados depende de ello.
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
7. Para entidades del modelo base, define la tabla e índices en
   `database/schema.sql` y agrégala a RLS. Para extensiones de contratos o
   capacidades del Documento Maestro, usa una migración idempotente y pequeña
   en `database/migrations/`, sin duplicar entidades existentes.

## Contexto de marca

IMVOLT — MARKETING INMOBILIARIO AI. Esta API sostiene IMVOLT Studio (contenido
IA), IMVOLT Ads (campañas Meta), IMVOLT Pulse (analítica) e IMVOLT Connect
(integraciones). El producto no garantiza ventas: aumenta la capacidad de
producción y la disciplina comercial.
