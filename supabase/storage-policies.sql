-- ============================================================================
-- STORAGE POLICIES — solo le policy del bucket foto-profili.
-- Da eseguire SOLO se hai già applicato migration-v5.sql ma le policy non
-- sono state create (oppure se vuoi ripartire da zero su un progetto nuovo).
-- Idempotente.
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('foto-profili', 'foto-profili', true)
  on conflict (id) do nothing;

-- helper SECURITY DEFINER (evita di innescare RLS ricorsive sui profiles)
create or replace function public.is_admin_storage() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and is_admin and attivo);
$$;
grant execute on function public.is_admin_storage() to authenticated;

-- INSERT: ogni utente può caricare solo nella propria cartella {auth.uid()}/*
--        l'admin può caricare ovunque
drop policy if exists foto_upload on storage.objects;
create policy foto_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'foto-profili'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin_storage()
    )
  );

-- UPDATE: stessa regola
drop policy if exists foto_update on storage.objects;
create policy foto_update on storage.objects for update to authenticated
  using (
    bucket_id = 'foto-profili'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin_storage()
    )
  );

-- DELETE: stessa regola
drop policy if exists foto_delete on storage.objects;
create policy foto_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'foto-profili'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin_storage()
    )
  );
-- SELECT: il bucket è public=true → i file sono leggibili via URL pubblico
--         senza policy di select (è automatico in Supabase Storage).

-- Verifica finale: devono venire fuori 3 righe (foto_upload, foto_update, foto_delete)
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'storage' and policyname like 'foto_%';
