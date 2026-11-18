# Activar Meta Ads en producción

La API ya implementa Facebook Login for Business, valida los tokens contra la
app configurada, cifra los tokens en el servidor, lista las cuentas publicitarias
y publica campañas en estado pausado. La verificación del negocio en Meta no
concede por sí sola permisos de Marketing API ni activa el acceso para usuarios
externos.

## Estado local revisado

- El `META_APP_ID` del frontend coincide con el del backend.
- `META_LOGIN_CONFIG_ID` está configurado en el frontend.
- El callback que construye el frontend coincide con el callback del backend:
  `${PUBLIC_API_URL}/api/v1/conexiones/meta/oauth/callback`.
- La API tiene configurados el secreto de la app, la clave de cifrado de 32
  bytes y las URL públicas.
- `META_OAUTH_ALLOW_LIMITED_ACCESS` está apagado. No se deben habilitar
  conexiones publicitarias con permisos incompletos en producción.

Los valores de `.env` locales no configuran automáticamente Render ni Vercel;
las mismas variables deben estar cargadas en los respectivos entornos de
producción.

## Pasos en Meta for Developers

1. En la app correcta, agrega/configura **Marketing API** y **Facebook Login for
   Business**. En la configuración de Login for Business asociada al
   `META_LOGIN_CONFIG_ID`, solicita los permisos que usa el flujo:
   - `ads_management`: crear y administrar campañas, conjuntos y anuncios.
   - `ads_read`: lectura y analítica de anuncios.
   - `pages_show_list`: listar las páginas que pueden usarse en los anuncios.
   - `leads_retrieval`: solo si se van a importar leads de formularios
     instantáneos.
   - Los permisos de Instagram que Meta solicite para seleccionar una cuenta
     profesional vinculada a la página.
2. En **Facebook Login for Business → Configuración**, registra como URI de
   redirección OAuth válida exactamente el callback de producción:
   `https://imvolt-api.onrender.com/api/v1/conexiones/meta/oauth/callback`.
   Debe ser idéntico al `PUBLIC_API_URL` desplegado más
   `/api/v1/conexiones/meta/oauth/callback`.
3. En **Revisión de la aplicación → Permisos y funciones**, solicita **Acceso
   avanzado** para los permisos que necesiten usar personas que no tienen un rol
   en la app. Completa la revisión solicitada por Meta, incluida la grabación
   del flujo de autorización y las instrucciones de prueba.
4. Cambia la app a **En vivo** cuando Meta haya aprobado lo requerido. En modo
   Desarrollo solo pueden autorizar la app las personas con rol en ella; la
   verificación del negocio no quita esta limitación.
5. Verifica que cada persona que conecta tenga acceso a la cuenta publicitaria
   y a la página/Instagram seleccionados en Business Manager. La app no concede
   acceso a esos activos por sí misma.

## Variables de producción

Backend (Render):

- `META_APP_ID`
- `META_APP_SECRET`
- `META_TOKEN_ENCRYPTION_KEY` (32 bytes, hex; mantenerla estable para poder
  descifrar conexiones ya guardadas)
- `PUBLIC_API_URL`
- `PUBLIC_FRONTEND_URL`
- `META_GRAPH_API_VERSION` (debe coincidir con la versión definida en el
  frontend)
- `META_OAUTH_ALLOW_LIMITED_ACCESS=false`

Frontend (Vercel):

- `META_APP_ID` (puede ser visible en el navegador)
- `META_LOGIN_CONFIG_ID`
- `META_GRAPH_API_VERSION`
- `VITE_API_URL` (URL pública de la API seguida de `/api`)

Después de cambiar variables del frontend, vuelve a desplegarlo para que Vite
las incluya en el build. Los cambios del backend requieren reiniciar/redeployar
la API.

## Comprobación funcional

1. En IMVOLT, abre **Configuración → Integraciones → Conectar Meta**.
2. Autoriza la cuenta publicitaria de producción y confirma que aparecen
   cuentas activas.
3. Comprueba que aparecen las páginas disponibles y que se puede guardar un
   borrador de campaña.
4. Publica una campaña de prueba: IMVOLT la crea en `PAUSED`; revisa el objeto en
   Ads Manager antes de activarlo manualmente.

Si falla, consulta la respuesta de conexión y los logs `[meta][oauth]` de la
API. No compartas el `META_APP_SECRET`, tokens OAuth ni la clave de cifrado.
