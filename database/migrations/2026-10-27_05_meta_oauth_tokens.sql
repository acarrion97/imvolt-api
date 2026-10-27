-- Credenciales OAuth cifradas por cuenta publicitaria conectada.
-- Requiere 2026-10-27_01_ai_connections.sql.

alter table public.conexiones
    add column if not exists access_token_enc text,
    add column if not exists token_expira_en timestamptz;

notify pgrst, 'reload schema';
