import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
 * cliente, y supabase-js envía ese JWT en cada consulta PostgREST. Si
 * ocurriera en el cliente de servicio, TODAS las consultas pasarían a
 * ejecutarse con el rol `authenticated` (revocado en `schema.sql`) →
 * `permission denied for table usuarios`.
 *
 * Mínimo privilegio: el login solo necesita la clave ANON (pública), no la
 * service role. Y se crea un cliente NUEVO por intento: no queda ninguna
 * sesión de usuario retenida en la memoria del servidor.
 */
export const createAuthClient = (): SupabaseClient =>
  createClient(config.db.url, config.db.anonKey || config.db.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

export default supabase;
