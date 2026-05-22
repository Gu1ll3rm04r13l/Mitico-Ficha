-- =====================================================================
-- Fichero Mítico — 0003 storage
-- Bucket privado para selfies. Acceso solo vía URLs firmadas (service role).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('fichaje-selfies', 'fichaje-selfies', false)
on conflict (id) do nothing;

-- Sin políticas públicas: el bucket es privado.
-- La subida la hace la Edge Function / route handler con service role.
-- La lectura en el panel admin se hace con createSignedUrl (expira en 1h).
-- Staff autenticado puede listar/leer objetos del bucket (para el panel).
create policy "selfies staff select" on storage.objects
  for select to authenticated
  using (bucket_id = 'fichaje-selfies' and fichaje.es_staff());
