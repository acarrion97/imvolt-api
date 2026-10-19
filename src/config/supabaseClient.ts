import { createClient } from '@supabase/supabase-js';
import { config } from './global';

// Cliente con la clave de SERVICE ROLE: solo se usa en backend.
// El navegador NUNCA debe recibir esta clave (ver documento maestro, §12).
const supabase = createClient(config.db.url, config.db.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Cliente AISLADO para `signInWithPassword` (services/auth.service.ts).
 *
 * `signInWithPassword` guarda la sesión del usuario en la memoria del
 * cliente, y supabase-js envía ese JWT en cada consulta PostgREST
 * (`fetchWithAuth` → `_getAccessToken()`). Si ocurriera en el cliente de
 * servicio, TODAS las consultas pasarían a ejecutarse con el rol
 * `authenticated`, que `schema.sql` revoca explícitamente →
 * `permission denied for table usuarios` en cada endpoint.
 *
 * Al usar una instancia aparte (memoria propia con `persistSession: false`),
 * el cliente principal nunca tiene sesión y sigue viajando siempre con la
 * service role key.
 */
export const supabaseAuthSession = createClient(config.db.url, config.db.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;
