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
| Service | `src/core/base.service.ts` + `src/services/` | CRUD genérico + lógica de negocio (Higgsfield, Meta, estratega) |
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
- **Protección de credenciales**: los campos sensibles se enmascaran en respuestas
  y auditoría; los tokens nunca se exponen al frontend.
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

Para asignar al superadministrador que administra el catálogo global y el panel
de plataforma, define `PLATFORM_ADMIN_EMAILS=correo@tu-dominio.com` en `api/.env`
local o en las variables de entorno del servicio API (Render). Admite varios
correos separados por coma y no distingue mayúsculas. El correo debe coincidir
con la cuenta de inicio de sesión de IMVOLT. Reinicia o redespliega la API para
aplicar el cambio. Las plantillas ya son globales: `plantillas` no contiene
`empresa_id`; cualquier empresa puede consultarlas, pero solo esos correos
pueden crearlas, editarlas o eliminarlas. El frontend oculta las acciones a
otros usuarios y la API mantiene la autorización como control definitivo.

El panel `/administracion` requiere ese mismo correo de superadministrador.
Sus endpoints `/api/v1/admin/planes`, `/api/v1/admin/empresas` y
`/api/v1/admin/configuraciones` están protegidos en el servidor; la consulta
global de empresas no modifica las rutas tenant-scoped ya existentes. Antes de
desplegar, ejecuta las migraciones `0037`–`0044` en orden. Los planes se
desactivan en vez de borrarse y las empresas nuevas reciben el plan `AGENT`
(el activo más barato, si no existe). Suspender una empresa bloquea sus
llamadas al API; el superadministrador conserva acceso al panel para poder
reactivarla.

## Módulos y rutas

| Módulo | Rutas | Contenido |
|--------|-------|-----------|
| Auth | `/api/auth` | register (cuenta + empresa + usuario + rol propietario), login, me |
| Platform Admin | `/api/v1/admin` | Planes y configuraciones globales; listado paginado y administración de empresas (solo superadministrador) |

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
| Brand Kit | `/api/v1/brand-assets`, `/api/v1/brand-colors` | Biblioteca de marca: archivos con control de versiones y paleta de colores |

Cada módulo CRUD expone `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`
y `DELETE /:id`, con filtros por querystring (`?campo=valor&limite=20&pagina=1`).
Los recursos CRUD corresponden 1:1 a los modelos de `src/models/` y a las
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
| `brand-asset` | `empresa`, `version_activa` (versión del archivo que se sirve al descargar) |
| `brand-color` | `empresa` |

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

### Brand Kit — archivos de marca con versiones (bucket privado)

Los archivos del Brand Kit (logos, tipografías, documentos) viven en el
**bucket privado `brand-kit`** de Supabase Storage; el navegador nunca lo lee
en directo. La descarga siempre pasa por el API, que valida sesión + tenant y
emite una signed URL de 5 minutos (`createSignedUrl`).

Estructura de ruta (aislamiento por tenant):

```
empresa_{empresa_id}/{brand_asset_id}/v{numero}-{nombre_archivo}
```

Rutas de negocio (`extraRoutes` del CRUD, documentadas con `@swagger` en
`src/routes/brandkit.route.ts`):

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/brand-assets/:id/versiones` | **multipart**: sube una versión (máx. 10 MB, tipo validado por contenido); queda activa |
| `GET` | `/api/v1/brand-assets/:id/versiones` | Historial completo (v1 → vn, numeración monotónica) |
| `GET` | `/api/v1/brand-assets/:id/descarga` | Signed URL de la **versión activa** (5 min) |
| `GET` | `/api/v1/brand-assets/:id/versiones/:vid/descarga` | Signed URL de una versión concreta |
| `POST` | `/api/v1/brand-assets/:id/versiones/:vid/restaurar` | Vuelve a activar una versión antigua |
| `DELETE` | `/api/v1/brand-assets/:id/versiones/:vid` | Borra la versión y su blob (reapunta la activa) |

Los metadatos (nombre, categoría, notas) se manejan con el CRUD estándar; el
blob viaja **solo** por `POST /:id/versiones` (multer en memoria, sin disco).
Escribir requiere rol `propietario | administrador | marketing`; leer y
descargar lo puede hacer cualquier miembro de la empresa (`readOnly`).

**Validación del archivo.** El tipo se comprueba por **contenido** (magic
bytes), no por el `Content-Type` que declara el cliente en el multipart: un
PNG subido como `text/plain` se acepta y se guarda con `contentType:
image/png`, mientras que un texto disfrazado de PNG se rechaza con `415`.
El límite de 10 MB responde `413`. Todos los errores salen en JSON
`{ message, details? }`: nunca HTML ni el stack de la petición.

**Numeración de versiones.** El número es **monotónico**: lo lleva el
contador `brand_assets.siguiente_numero`, que solo avanza. Borrar la versión
más reciente NO libera su número, así que la numeración nunca se repite
(migración `0036`).

Precondición: ejecutar las migraciones de `database/migrations/` en el SQL
Editor de Supabase, en orden (ver `database/README.md`). La 0022–0024 crean
`brand_assets`, `brand_asset_versions` y `brand_colors`; la 0028 crea el
bucket; la 0036 añade el contador de numeración. Todas son idempotentes.
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
calcula el precio USD desde el catálogo, valida propiedad/modelo y conserva el
identificador de proveedor. `POST .../quote` devuelve `model_id`, `price_usd`
y `currency` antes de aceptar la generación. Los jobs nuevos avanzan por
`created → quoted → queued → processing → completed/failed/canceled`:

```
POST /api/v1/creative/generations/quote → cotiza en USD desde el catálogo
POST /api/v1/creative/generations      → valida la cotización, registra el precio y encola
GET  /api/v1/creative/generations/:id  → consulta/persiste el estado del proveedor
```

El cliente debe enviar una `idempotency_key` y el `quoted_price_usd` vigente al
crear el job; una repetición con la misma clave y payload devuelve la generación
original sin volver a encolarla. El precio queda registrado en USD antes de
impuestos. Tanto en simulación como con un proveedor real, `GET` actualiza los
estados posteriores a `queued`. El estado legado `credits_reserved` puede
aparecer en generaciones históricas, pero no forma parte del flujo nuevo.

### Contratos REST de campañas y leads

Para `VITE_DATA_PROVIDER=rest`, `/api/v1/campaigns` y `/api/v1/leads` traducen
los nombres del frontend sobre `campanias_publicitarias` y `contactos`; no
duplican esas entidades. El CRUD heredado `/campanias-publicitarias` y
`/contactos` conserva su contrato del diagrama.

```
GET/POST/PATCH/DELETE /api/v1/campaigns
GET/POST/PATCH/DELETE /api/v1/leads
GET/DELETE            /api/v1/conexiones
POST                  /api/v1/conexiones/meta/oauth/start
GET                   /api/v1/conexiones/meta/oauth/callback
```

Cada empresa inicia Meta OAuth con un usuario autorizado de la plataforma. El
estado OAuth, las cuentas y sus tokens quedan vinculados a `empresa_id`, nunca
al ID del usuario de IMVOLT. El callback intercambia el código por un token de
larga duración, consulta las cuentas publicitarias activas y guarda el token
cifrado en `conexiones`. `meta_user_id` es únicamente el ID externo asignado por
Meta, para atender sus solicitudes de eliminación de datos. El navegador nunca
recibe el App Secret ni el token de Meta.

### Límites de uso por plan

Cada plan declara restricciones numéricas en `planes`: `limite_usuarios`,
`limite_proyectos`, `limite_imagenes_ia`, `limite_videos_ia` y
`limite_campanias_meta`. Un valor en `NULL` (o una empresa sin plan) no
restringe ese recurso.

`services/plan-limits.service.ts` cuenta el consumo actual de la empresa y
responde **403** al alcanzar el máximo, antes de crear el registro:

| Recurso | Se valida en | Conteo |
|---------|--------------|--------|
| Proyectos | `POST /api/v1/proyectos` | `proyectos` de la empresa |
| Imágenes IA | `POST /api/v1/creative/generations` | `generaciones` cuyo modelo es `image` |
| Videos IA | `POST /api/v1/creative/generations` | `generaciones` cuyo modelo es `video` |
| Campañas Meta | `POST /api/v1/campaigns`, `POST /api/v1/campanias-publicitarias` | `campanias_publicitarias` de la empresa |
| Miembros | `POST /api/v1/usuarios`, `POST /api/v1/usuarios/invitaciones` | `usuarios` activos de la empresa |

El mensaje indica el plan, el máximo y el consumo (`Tu plan PRIME permite 10
proyectos y ya tienes 10. Actualiza tu plan para continuar.`) y el frontend lo
muestra tal cual. Los `PATCH` y `DELETE` no consumen cuota, así que no se
restringen. Los beneficios visibles en la tabla de planes (`caracteristicas`)
se generan en el servidor a partir de estos números: no se envían desde el
cliente.

### Historial de créditos

Los endpoints de wallet, transacciones y recargas se retiraron. Las migraciones
y tablas existentes se conservan para no perder registros históricos; el flujo
actual de generaciones cotiza y registra precios en USD y no consulta ni
modifica el ledger.

## Proveedores en modo simulado

Sin una integración activa configurada para la empresa, la API funciona en
modo simulado: Higgsfield devuelve jobs de demostración y Meta genera IDs
simulados. Las credenciales de proveedores no se guardan en `.env`.

El navegador **nunca** recibe claves de Higgsfield ni tokens de Meta (§12).

### Conectar clientes con Facebook Login SDK

En Render configura estas variables (no las pongas en Vercel ni en variables
`VITE_*`):

| Variable | Valor / uso |
|---|---|
| `META_APP_ID` | ID público de la app creada en Meta for Developers |
| `META_APP_SECRET` | App Secret de Meta; solo servidor |
| `META_TOKEN_ENCRYPTION_KEY` | Clave aleatoria de 32 bytes en hexadecimal (64 caracteres) |
| `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` | Clave aleatoria de 32 bytes en hexadecimal; cifra los `app_secret` guardados por empresa |
| `PUBLIC_API_URL` | `https://imvolt-api.onrender.com` |
| `PUBLIC_FRONTEND_URL` | `https://imvolt.vercel.app` |
| `ALLOWED_ORIGIN` | `https://imvolt.vercel.app` |
| `META_GRAPH_API_VERSION` | Versión de Graph API habilitada para la app, por ejemplo `v24.0` |

Genera `META_TOKEN_ENCRYPTION_KEY` con
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Guárdala de forma permanente y segura: cambiarla sin volver a conectar las
cuentas invalida los tokens ya cifrados.

Genera `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` con el mismo comando. Debe
configurarse solo en el backend antes de crear o actualizar credenciales de
integración. Los `app_secret` se guardan con AES-256-GCM y se descifran solo
en el backend que los consume; las credenciales anteriores en texto plano se
cifran automáticamente al usarse. Conserva la clave: cambiarla impide
descifrar los secretos ya guardados.

`META_APP_ID` es el identificador público. Configúralo en el `.env` del
frontend y como variable de build en Vercel. En el panel Business Login de Meta
crea una configuración para los permisos publicitarios que necesita la
integración (`ads_management`, `ads_read`, `pages_show_list`,
`pages_manage_ads` e `instagram_basic`) y define su ID en
`META_LOGIN_CONFIG_ID`, tanto localmente como en las variables de build de
Vercel. Configura `META_GRAPH_API_VERSION` en el frontend y el backend con la
misma versión. Nunca pongas `META_APP_SECRET` ni `META_TOKEN_ENCRYPTION_KEY`
en el frontend.

En Meta Developer → Facebook Login → Configuración, añade `localhost` y
`imvolt.vercel.app` a **Dominios de la app** y registra estas URI en **URI de
redireccionamiento de OAuth válidos**. Deben coincidir exactamente con
`PUBLIC_API_URL + /api/v1/conexiones/meta/oauth/callback`:

```text
http://localhost:3000/api/v1/conexiones/meta/oauth/callback
https://imvolt-api.onrender.com/api/v1/conexiones/meta/oauth/callback
```

Para probar en local, configura en `api/.env`:

```text
PUBLIC_API_URL=http://localhost:3000
PUBLIC_FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGIN=http://localhost:5173
```

Y en `frontend/.env`, usa `VITE_API_URL=http://localhost:3000/api`,
`VITE_DATA_PROVIDER=rest`, `META_APP_ID` y `META_LOGIN_CONFIG_ID`.

El botón «Conectar con Facebook» redirige el navegador al diálogo OAuth de
Facebook con `config_id` (Facebook Login for Business) y `response_type=code`.
Facebook no admite `response_type=token` en ese flujo; el código se intercambia
en el servidor mediante `GET /api/v1/conexiones/meta/oauth/callback`, que
valida el `state`, canjea el código con `META_APP_SECRET` y redirige a
`/configuracion?meta=…`. El frontend no usa el SDK de JavaScript de Facebook.

En **Solicitudes de eliminación de datos**, configura:

`https://imvolt-api.onrender.com/api/v1/conexiones/meta/data-deletion`

La respuesta de eliminación devuelve una URL de estado en
`https://imvolt.vercel.app/eliminacion-datos.html`. Activa el inicio de sesión
OAuth web y el modo estricto de URI de redireccionamiento. El usuario inicia
la conexión desde Configuración de IMVOLT; no debe escribir su contraseña de
Facebook dentro de IMVOLT.

La app de Meta debe estar en modo **Live** y contar con acceso avanzado/revisión
para los permisos solicitados antes de conectar usuarios que no sean roles de
la app. La conexión también necesita `pages_show_list` para escoger la página y
`pages_manage_ads` para crear el formulario instantáneo. Después de añadir esos
permisos a la configuración Business Login, los usuarios deben volver a
conectar Meta para otorgarlos. `instagram_basic` permite descubrir la cuenta
profesional de Instagram vinculada a cada Página; la API solo devuelve ese
recurso si está administrado por la persona que autorizó. Ejecuta la migración
de anuncios y vuelve a conectar las cuentas existentes para guardar su moneda
de facturación. Cada persona solo podrá seleccionar cuentas publicitarias,
páginas y cuentas de Instagram a las que su Facebook tenga acceso.

Desde Estudio, una generación completada puede convertirse en un anuncio de
formulario: el usuario elige cuenta y página, ciudad disponible en Meta,
presupuesto diario en la moneda de la cuenta, periodo, título, texto y URL HTTPS
de privacidad. IMVOLT guarda el anuncio como borrador y solicita aprobación
explícita; un propietario o administrador debe aprobarlo antes de publicar.
La publicación verifica nuevamente la Página, Instagram y la ciudad/jurisdicción
contra Meta y crea el formulario instantáneo con nombre, correo y teléfono,
sube el creativo desde la URL pública de Higgsfield y crea campaña, conjunto y
anuncio pausados. La clave `Idempotency-Key` evita crear duplicados ante
reintentos. Meta no inicia gasto hasta que se active el anuncio desde Ads
Manager. Antes de desplegar la API, ejecuta
`database/migrations/2026-11-05_06_meta_lead_ads.sql` y
`database/migrations/2026-11-06_03_advertising_approval_idempotency.sql`.

### Configurar Higgsfield

Para Higgsfield, crea la configuración de credenciales en
`POST /api/v1/configuraciones-integraciones` y vincúlala a la empresa y al
proveedor en `POST /api/v1/empresas-integraciones`. Ambos endpoints requieren
sesión y permiso `gestionar_integraciones`.

Consulta los IDs disponibles con:

```sql
select integracion_id, nombre
from public.integraciones
where nombre in ('Higgsfield', 'Meta Ads');
```

La configuración de Higgsfield requiere primero una configuración (el
`empresa_id` se toma de la sesión):

```json
{
  "url_base": "https://api.higgsfield.ai",
  "api_key": "<API Key ID>",
  "entorno": "produccion",
  "app_secret": "<API Key Secret>"
}
```

Luego crea el vínculo en `empresas_integraciones` con el `integracion_id`
correspondiente y el `configuracion_integracion_id` recién creado. Las
conexiones con `entorno: "sandbox"` se simulan; usa `"produccion"` para que el
backend invoque al proveedor. La API enmascara los campos secretos en las
respuestas y los sustituye por una máscara en la bitácora. Mantén RLS
habilitado y no entregues la service role key al cliente.

### Configurar Lotes al Mando

Antes del despliegue, ejecuta `database/migrations/2026-11-06_04_seed_lotes_al_mando_integration.sql`
y `database/migrations/2026-11-06_06_integration_secrets_text.sql`. Configura
`INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` en el backend. Después, desde
Configuración → Integraciones de la empresa, guarda las credenciales de acceso
de esa organización. El API consulta la configuración activa vinculada a la
empresa; no usa credenciales de entorno, sesión Express ni tokens enviados por
el frontend.

El formulario guarda el correo en `api_key` y la contraseña en `app_secret`.
Ambos campos se enmascaran en respuestas y auditoría. El servicio inicia sesión
con `POST /api/auth/login` y consulta proyectos/lotes en `/api/v1`, enviando el
token como `Authorization: Bearer`. Solo se admite el endpoint HTTPS oficial.
Esta integración no tiene sandbox; debe configurarse como producción.

Ejecuta también `database/migrations/2026-11-06_05_lotes_al_mando_sync.sql`
para crear los mapeos idempotentes y las funciones de persistencia protegidas
por `service_role`. `POST /api/v1/integraciones/lotes-al-mando/sync` importa o
actualiza proyectos y lotes como propiedades de la empresa. Los lotes sin
precio positivo o sin una relación válida proyecto → etapa → manzana se omiten.
La operación no elimina registros si dejan de aparecer en el origen.

Campos usados por proveedor:

| Proveedor | `url_base` | `api_key` | `api_id` | `app_secret` | `access_token` |
|-----------|------------|-----------|----------|--------------|----------------|
| Higgsfield | `https://api.higgsfield.ai` | API Key ID | — | API Key Secret | — |
| Lotes al Mando | `https://lotes-al-mando-api.onrender.com` | Correo de acceso | — | Contraseña | — |
| Meta Ads | OAuth del servidor | — | — | — | Cifrado en `conexiones` |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y, en producción,
`SUPABASE_ANON_KEY` permanecen en variables de entorno: la API necesita esas
credenciales para conectarse a la base de datos y leer las configuraciones.
El catálogo vivo de `modelos_ia` lista los modelos publicados por Higgsfield y
sus precios. Sólo los workflows registrados en `MODEL_WORKFLOWS` ejecutan
contra el proveedor; el resto se genera en simulación.

### Publicar una campaña en Meta

`POST /api/v1/campanias-publicitarias/:id/publicar` crea la campaña en Meta con el SDK
oficial, **siempre `PAUSED`** y con `special_ad_categories: ['HOUSING']`. Body opcional:
`{ "validar_solo": true }` (Meta valida sin crear nada).

- Rol propietario/administrador/marketing con permiso `gestionar_campanas`.
- Usa el token cifrado de la cuenta Meta seleccionada y conectada a la empresa;
  sin conexión activa, el flujo permanece simulado.
- La campaña siempre se crea en estado PAUSED y nunca inicia gasto automáticamente.
- ✅ Migración **aplicada el 2026-10-27**: `database/migrations/2026-10-27_meta_campaign_publish.sql`
  (columnas `meta_campaign_id`, `meta_estado`, `publicada_en`). Sin ella este
  endpoint respondía PGRST204 *"Could not find the 'meta_estado' column ...
  in the schema cache"*.
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
#      migrations/2026-10-27_05_meta_oauth_tokens.sql
#      migrations/2026-11-05_meta_oauth_state.sql
#      migrations/2026-10-27_meta_campaign_publish.sql (publicación Meta)
#      migrations/2026-11-06_01_credit_ledger_atomic.sql
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
├── requests/        Validaciones Joi por dominio (helpers + dominio.*)
├── resources/       Vistas de respuesta por dominio
├── controllers/     Un controlador por módulo (createCrudRouter)
├── routes/          Exposición de routers (+ Swagger de auth, identidad,
│                    Brand Kit y Catálogo)
├── services/        auth, audit, miembros (invitación + guardas de equipo),
│                    higgsfield, meta, strategist,
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
