# Prueba de anuncios: OpenRouter → WhatsApp Cloud API

Flujo temporal para validar de punta a punta:

```
ficha de propiedad
  → copy del anuncio
  → imagen con OpenRouter (o PNG de marca local si no hay saldo)
  → plantilla de WhatsApp (opcional, primer contacto)
  → imagen + caption por WhatsApp
```

> Es un servicio de **prueba**. Para producción usa credenciales productivas,
> plantillas aprobadas y desactiva `WHATSAPP_TEST_ENABLED`.

---

## 1. Variables de entorno

En `api/.env`:

```dotenv
# WhatsApp Cloud API (número de prueba)
WHATSAPP_ID_TEST=1478522842011731
WHATSAPP_TOKEN_TEST=EAAG...
WHATSAPP_PHONE_TEST=593996349939
WHATSAPP_GRAPH_VERSION=v25.0
WHATSAPP_TEST_ENABLED=true
WHATSAPP_TEST_TEMPLATE_NAME=jaspers_market_plain_text_v1
WHATSAPP_TEST_TEMPLATE_LANGUAGE=en_US

# OpenRouter (imágenes temporales)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_IMAGE_MODEL=google/gemini-3.1-flash-lite-image
OPENROUTER_IMAGE_SIMULATE=false
OPENROUTER_IMAGE_FALLBACK=true
OPENROUTER_IMAGE_TIMEOUT_MS=60000
```

- `WHATSAPP_ID_TEST` es el **Phone number ID** de Meta, no el número visible.
- `WHATSAPP_PHONE_TEST` va **solo con dígitos** (sin `+`, sin espacios).
- `OPENROUTER_IMAGE_SIMULATE=true` evita llamar a OpenRouter y usa el PNG local.
- `OPENROUTER_IMAGE_FALLBACK=true` permite probar WhatsApp aunque OpenRouter
  falle (por ejemplo, 402 por falta de saldo).

---

## 2. Prueba rápida sin frontend

Desde `api`:

```bash
npm run whatsapp:test
```

Envía una imagen de demostración al número configurado.

```bash
# Primero manda la plantilla aprobada y luego la imagen
npm run whatsapp:test -- --template

# Manda también el copy como mensaje de texto
npm run whatsapp:test -- --text

# Personaliza destinatario, prompt y copy
npm run whatsapp:test -- --to=593996349939 \
  --prompt="Penthouse moderno con terraza y vista a la ciudad, fotografía arquitectónica" \
  --caption="🏡 Penthouse IMVOLT\nEscrbíbenos para agendar una visita."

# Enviar una imagen indicando solo su URL pública (sin subir archivo)
npm run whatsapp:image-url
npm run whatsapp:image-url -- --url=https://.../anuncio.jpg --caption="Texto"
```

También puedes usar variables: `ANUNCIO_TO`, `ANUNCIO_PROMPT`,
`ANUNCIO_CAPTION`, `ANUNCIO_ASPECT_RATIO`, `SEND_TEMPLATE=1`, `SEND_TEXT=1`.

---

## 3. Endpoints de la API

Todos requieren sesión (`Authorization: Bearer <access_token>`) y rol
propietario, administrador o marketing. Se montan en:

```
/api/v1/whatsapp/test
```

| Método | Ruta        | Para qué sirve |
|--------|-------------|----------------|
| GET    | `/status`   | Configuración enmascarada (sin secretos) |
| POST   | `/template` | Enviar una plantilla aprobada |
| POST   | `/text`     | Enviar un texto libre (ventana de 24 h) |
| POST   | `/image`    | Enviar una imagen por prompt, URL, base64 o `generation_id` |
| POST   | `/anuncio`  | Generar copy + imagen y enviarlos por WhatsApp |

### Pantalla empresarial para la demostración de Meta

Con la app frontend apuntando a esta API y una sesión de propietario,
administrador o marketing, abre **WhatsApp Business** en el menú lateral
(`/whatsapp`). Desde ahí se puede:

1. Ver si el servicio de prueba está configurado (sin mostrar el token).
2. Enviar una plantilla aprobada a un destinatario que dio su consentimiento.
3. Mostrar la aceptación de Meta y el identificador del mensaje.
4. Ver respuestas entrantes en la bandeja, si el webhook está configurado; pulsa
   **Actualizar** después de responder desde el teléfono.

Para grabar la revisión, muestra el flujo desde esa pantalla empresarial:
formulario, confirmación de consentimiento, acción **Enviar plantilla de
prueba** y respuesta de éxito. Usa datos y una plantilla de prueba; no muestres
tokens, secretos ni teléfonos ajenos. Para que aparezcan respuestas en la
bandeja, configura el webhook `https://<dominio-api>/api/webhooks/whatsapp`, el
token de verificación y la suscripción al evento `messages` en la app de Meta.

La pantalla usa las credenciales de prueba globales `WHATSAPP_*_TEST` del
backend. No equivale a un flujo de alta OAuth de WhatsApp por empresa.

### Obtener el token de sesión

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tu-correo@empresa.com","password":"TuClave"}'
```

Copia `access_token`.

### Enviar la plantilla

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/test/template \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "593996349939",
    "template": "jaspers_market_plain_text_v1",
    "language": "en_US"
  }'
```

### Generar y enviar un anuncio desde una propiedad

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/test/anuncio \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "propiedad_id": 12,
    "enviar_plantilla": true,
    "template": "jaspers_market_plain_text_v1",
    "language": "en_US",
    "aspect_ratio": "1:1"
  }'
```

La respuesta incluye `image.simulated`, `image.model`, `image.media_id`,
`copy`, `template.sent` y el `wamid` de WhatsApp.

### Enviar solo una imagen

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/test/image \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "593996349939",
    "prompt": "Sala de estar moderna, luz natural, fotografía inmobiliaria, sin texto",
    "caption": "Así se ve tu próximo hogar 🏡"
  }'
```

También acepta `image_url` (HTTPS público) o `generation_id` de
`/api/v1/creative/generations`.

#### Imagen por URL (sin subir archivo)

En este modo la API **no descarga ni sube** la imagen: envía
`{"type":"image","image":{"link":"..."}}` y Meta la descarga desde esa URL
pública.

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/test/image \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "593996349939",
    "image_url": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
    "caption": "🏡 Imagen enviada solo por enlace"
  }'
```

Desde consola:

```bash
npm run whatsapp:image-url
npm run whatsapp:image-url -- --url=https://.../anuncio.jpg --caption="Texto"
```

Requisitos de la URL: HTTPS, accesible desde Internet (nada de `localhost`,
`127.0.0.1` ni rangos privados), content-type `image/png` o `image/jpeg` y
máximo 5 MB. Si el enlace es una URL firmada, debe seguir vigente cuando Meta
la descargue.

---

## 4. OpenRouter: imágenes

### Credenciales

1. Crea una clave en <https://openrouter.ai/keys>.
2. Carga saldo en <https://openrouter.ai/settings/credits>.
   **OpenRouter exige al menos USD 1.00 de saldo para devolver imágenes.**
3. Elige un modelo con salida de imagen:

| Modelo | Coste aproximado por imagen |
|--------|-----------------------------|
| `google/gemini-3.1-flash-lite-image` | USD 0.00003 |
| `google/gemini-2.5-flash-image` | USD 0.00003 |
| `google/gemini-3.1-flash-image` | USD 0.00006 |
| `google/gemini-3-pro-image` | USD 0.00012 |
| `openai/gpt-5-image-mini` | USD 0.000008 |

El precio real depende de los tokens de entrada/salida y del proveedor. OpenRouter
devuelve el coste en `usage.cost` y el servicio lo expone como
`estimated_cost_usd`.

### Por qué la clave actual no genera imágenes

La clave configurada tiene `0` créditos. OpenRouter responde:

```json
{"error":{"message":"This request requires at least $1.00 in balance for image or video output"}}
```

Con `OPENROUTER_IMAGE_FALLBACK=true`, el API devuelve un PNG de marca local
(degradado IMVOLT) para que el flujo de WhatsApp se pueda probar. En la respuesta
verás `simulated: true` y un `warning`.

### Usarlo desde el módulo Creative

1. Ejecuta la migración
   `database/migrations/2026-11-17_01_openrouter_image_model.sql` en Supabase.
2. `GET /api/v1/modelos` mostrará `OpenRouter · Nano Banana 2 Lite` con
   `provider: "openrouter"`.
3. Crea la generación:

```bash
curl -X POST http://localhost:3000/api/v1/creative/generations \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "modelo_id": 1,
    "idempotency_key": "prueba-openrouter-001",
    "quoted_price_usd": 0.0001,
    "prompt": "Anuncio inmobiliario, sala luminosa, fotografía profesional, sin texto",
    "parametros": { "ratio": "1:1" }
  }'
```

El controlador detecta `proveedor = "openrouter"`, genera la imagen de forma
síncrona, la guarda en el bucket privado `media-assets` y marca la generación
como `completed`. Los outputs se consultan en
`GET /api/v1/creative/generations/:id/outputs`.

---

## 5. WhatsApp: credenciales de prueba

### Número de prueba y token

1. Entra a <https://developers.facebook.com/apps>.
2. Selecciona tu app → **WhatsApp** → **API Setup** (Inicio rápido).
3. Ahí encuentras:
   - **Phone number ID** → `WHATSAPP_ID_TEST`.
   - **WhatsApp Business Account ID** (WABA).
   - **Temporary access token** (24 h) → `WHATSAPP_TOKEN_TEST` para pruebas.
   - El número de prueba de Meta (normalmente `+1 555…`).
4. En **To / Para**, agrega y verifica tu número real
   (`+593 99 634 9939`). Solo puedes escribir a números verificados.
5. Meta limita los mensajes del número de prueba; revisa el contador en API
   Setup.

Para un token que no expire en 24 h:

1. Business Settings → **Users** → **System users** → **Add**.
2. Asigna la app y la cuenta de WhatsApp Business.
3. **Generate new token** con `whatsapp_business_messaging` y
   `whatsapp_business_management`.
4. Copia el token a `WHATSAPP_TOKEN_TEST`.

> El token de mensajería no sirve para leer plantillas por API si no tiene
> `whatsapp_business_management`. Para crearlas/verlas usa WhatsApp Manager.

### Plantillas

1. WhatsApp Manager → **Account tools** → **Message templates**.
2. Crea una plantilla (categoría Utility/Marketing) con el nombre exacto que
   uses en `WHATSAPP_TEST_TEMPLATE_NAME`.
3. `jaspers_market_plain_text_v1` es la plantilla de ejemplo de la documentación
   de Meta; si no existe en tu WABA, crea una equivalente o cambia la variable.
4. Espera la aprobación. El idioma debe coincidir con
   `WHATSAPP_TEST_TEMPLATE_LANGUAGE` (`en_US`, `es_ES`, `es_EC`…).

### Ventana de 24 horas

- Una **plantilla** se puede enviar cuando quieras (sujeta a límites y calidad).
- Los **mensajes libres** (texto, imagen, etc.) solo se pueden enviar dentro de
  las 24 h posteriores al último mensaje del usuario.
- Fuera de esa ventana, primero envía una plantilla y espera la respuesta.
- Si ves el error `131047`, la ventana está cerrada.

### Límites de imagen

- Formatos: `image/png`, `image/jpeg`.
- Tamaño máximo: **5 MB**.
- Caption máximo: **1024 caracteres**.
- El servicio puede enviar la imagen de dos formas:
  - `media_id`: sube el archivo a `POST /{phone-number-id}/media` y luego envía
    `type: "image"` con `media_id` (recomendado, controlas los bytes).
  - `link`: envía directamente una URL HTTPS pública y Meta descarga la imagen
    (sin `media_id`, sin subida previa).

---

## 6. Credenciales de prueba para crear campañas en Meta

Esto es independiente de WhatsApp. Para probar la creación de campañas:

### Cuenta publicitaria de prueba

1. Meta Business Suite → **Configuración** → **Cuentas** → **Cuentas
   publicitarias** → **Agregar** → **Crear una cuenta nueva**.
2. También puedes usar una cuenta de prueba/sandbox si tu app está en modo
   desarrollo.
3. El ID tiene la forma `act_1234567890` → `META_AD_ACCOUNT_ID`.

### Token con permisos de anuncios

1. <https://developers.facebook.com/tools/explorer/>.
2. Selecciona tu app.
3. Añade permisos:
   - `ads_read`
   - `ads_management`
   - `business_management`
   - `pages_show_list`
   - `pages_read_engagement`
   - `leads_retrieval` (si usas formularios instantáneos)
   - `instagram_basic` (si usas Instagram)
4. Genera un **User Access Token**.
5. Para el backend, conviértelo en token de larga duración o usa un **System
   User** con acceso a la cuenta publicitaria.

### Probar sin crear nada

El repositorio ya incluye un script aislado:

```bash
cd frontend/scripts/meta-campaign-test
npm install
cp .env.example .env
# Edita META_ACCESS_TOKEN y META_AD_ACCOUNT_ID
npm run validar   # execution_options: ["validate_only"]
npm run crear     # crea la campaña en PAUSED
```

- `validate_only` valida la petición y **no crea** la campaña.
- La campaña se crea en `PAUSED`; no gasta dinero.
- Para inmobiliario, Meta suele exigir `special_ad_categories: ["HOUSING"]`.
  El script actual usa `[]`; cámbialo si Meta lo rechaza.
- El token necesita acceso a la cuenta publicitaria y permisos
  `ads_management`/`ads_read`.
- En modo desarrollo, la Marketing API solo funciona con cuentas de prueba,
  usuarios de prueba y recursos autorizados. Algunas funciones requieren
  revisión de la app (App Review) para pasar a producción.

### Desde la API de IMVOLT

El flujo de campañas usa OAuth de Meta, no el token del script:

1. `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY`,
   `PUBLIC_API_URL` y `PUBLIC_FRONTEND_URL`.
2. En el frontend: Conectar Meta → autorizar la cuenta publicitaria.
3. Crear borrador → validar → solicitar aprobación → aprobar → publicar
   (siempre en `PAUSED`).

Para una prueba sin gasto, usa `validar_solo: true` en
`POST /api/v1/campanias-publicitarias/:id/publicar`.

---

## 7. Errores frecuentes

| Error | Causa | Solución |
|-------|-------|----------|
| `402` / `requires at least $1.00` | OpenRouter sin saldo | Carga saldo o usa `OPENROUTER_IMAGE_SIMULATE=true` |
| `131047` | Ventana de 24 h cerrada | Envía primero una plantilla y espera respuesta |
| `132000` / `132001` | Plantilla inexistente o no aprobada | Créala en WhatsApp Manager o cambia el nombre |
| `190` | Token de WhatsApp expirado | Genera uno nuevo en API Setup |
| `100` + `Unsupported get request` | `WHATSAPP_ID_TEST` incorrecto o falta permiso | Usa el Phone number ID, no el WABA ID |
| `413` / imagen rechazada | Imagen > 5 MB | Usa un PNG/JPEG más ligero |
| `401` en la API | Falta el Bearer token | `POST /api/auth/login` y usa `access_token` |
| `403` | Rol sin permiso | Usa propietario, administrador o marketing |

---

## 8. Desactivar el servicio

En producción:

```dotenv
WHATSAPP_TEST_ENABLED=false
OPENROUTER_IMAGE_SIMULATE=false
OPENROUTER_IMAGE_FALLBACK=false
```

Las rutas devolverán `503` y no se enviará ningún mensaje.
