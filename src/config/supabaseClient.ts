import { createClient } from '@supabase/supabase-js';
import { config } from './global';

// Cliente con la clave de SERVICE ROLE: solo se usa en el backend.
// El navegador NUNCA debe recibir esta clave (ver documento maestro, §12).
const supabase = createClient(config.db.url, config.db.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;
