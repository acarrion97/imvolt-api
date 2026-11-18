# Probar `threads_basic` en IMVOLT

La API expone un flujo OAuth de prueba que solicita solo `threads_basic`, canjea
el código en el servidor y consulta `id,username` del perfil autorizado. El
token no se guarda ni se devuelve al navegador.

## URL de redirección para Meta

Registra exactamente esta URL en **Use cases → Access the Threads API →
Settings → Redirect Callback URLs**:

```text
https://imvolt-api.onrender.com/api/v1/threads/oauth/callback
```

Threads requiere HTTPS y no acepta `localhost` como redirect. Registra la misma
URL en `THREADS_REDIRECT_URI` en Render y en `api/.env` para mantener iguales
la URL autorizadora y la que usa el servidor al canjear el código.

## Variables del backend

```dotenv
THREADS_APP_ID=<Threads App ID, no el Meta App ID general>
THREADS_APP_SECRET=<Threads App Secret>
THREADS_REDIRECT_URI=https://imvolt-api.onrender.com/api/v1/threads/oauth/callback
```

El ID y el secreto salen de la app de Meta en **App settings → Basic → Threads
App ID / Threads App Secret**. El secreto debe estar solo en el backend.

## Flujo de prueba

1. Despliega la API con estas variables.
2. Abre:
   `https://imvolt-api.onrender.com/api/v1/threads/oauth/start`
3. Inicia sesión en Threads y autoriza `threads_basic` con la cuenta que
   agregaste como tester de Threads, si la app está en desarrollo.
4. El callback debe mostrar **Prueba de Threads completada**, `@username` e ID
   del perfil. Esa página confirma que la llamada de perfil básico funcionó.
5. En el panel de Meta vuelve a **Testing** y espera a que aparezca la llamada;
   la interfaz puede tardar en reflejarla.

Para probar otro dominio (staging), configura ese mismo dominio HTTPS tanto en
`THREADS_REDIRECT_URI` como en **Redirect Callback URLs**, luego redepliega.
No cambies solo uno: Meta exige que coincidan exactamente.
