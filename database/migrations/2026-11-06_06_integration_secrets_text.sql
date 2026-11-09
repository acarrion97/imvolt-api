-- AES-GCM ciphertext is longer than the original integration password.
alter table public.configuraciones_integraciones
  alter column app_secret type text;
