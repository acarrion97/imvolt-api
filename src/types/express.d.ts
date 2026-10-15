// types/express.d.ts
// Extensiones del Request de Express resueltas por los middlewares de sesión
// y contexto de organización (multiempresa).

declare global {
  namespace Express {
    interface Request {
      /** ID del usuario autenticado (Supabase Auth). */
      userId?: string;
      /** Datos del usuario autenticado. */
      user?: Record<string, unknown>;
      /** Organización activa del contexto (multi-tenant). */
      organizationId?: string;
      /** Rol del usuario dentro de la organización activa. */
      orgRole?: string;
    }
  }
}

export {};
