-- ============================================================================
-- MIGRAZIONE — Foto di gruppo per partita
-- Idempotente: rieseguibile senza danni.
--
-- Chi ha partecipato a una partita (iscritto, anche se poi non l'ha giocata
-- davvero non importa: basta la riga in match_registrations) può caricare
-- foto di gruppo e associarle a quella partita. L'admin può sempre.
-- Chi ha caricato una foto (o l'admin) può eliminarla.
-- ============================================================================

-- --------------------------- TABELLA + RLS ---------------------------------
create table if not exists public.foto_partita (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  url         text not null,
  caricato_da uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_foto_partita_match on public.foto_partita(match_id);

alter table public.foto_partita enable row level security;
drop policy if exists foto_partita_read on public.foto_partita;
create policy foto_partita_read on public.foto_partita for select to authenticated using (true);
-- Le scritture passano solo dalle funzioni sotto (security definer): nessuna
-- policy di insert/update/delete diretta, stesso pattern già usato altrove
-- in questo progetto ("unico punto di controllo").
grant select on public.foto_partita to authenticated;

-- --------------------------------- RPC -------------------------------------
create or replace function public.aggiungi_foto_partita(p_match uuid, p_url text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuovo_id uuid;
begin
  if not (
    public.is_admin() or
    exists (select 1 from public.match_registrations
            where match_id = p_match and user_id = auth.uid())
  ) then
    raise exception 'Solo chi ha partecipato alla partita (o admin) può aggiungere foto';
  end if;
  if length(trim(coalesce(p_url, ''))) = 0 then raise exception 'URL mancante'; end if;
  insert into public.foto_partita(match_id, url, caricato_da)
    values (p_match, p_url, auth.uid())
    returning id into nuovo_id;
  return nuovo_id;
end; $$;
grant execute on function public.aggiungi_foto_partita(uuid, text) to authenticated;

create or replace function public.elimina_foto_partita(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_admin() or
    exists (select 1 from public.foto_partita where id = p_id and caricato_da = auth.uid())
  ) then
    raise exception 'Solo chi ha caricato la foto (o admin) può eliminarla';
  end if;
  delete from public.foto_partita where id = p_id;
end; $$;
grant execute on function public.elimina_foto_partita(uuid) to authenticated;

-- ------------------------------- STORAGE ------------------------------------
-- Bucket pubblico in lettura (come foto-profili): le foto si vedono via URL
-- pubblico senza bisogno di policy di select.
insert into storage.buckets (id, name, public)
  values ('foto-partite', 'foto-partite', true)
  on conflict (id) do nothing;

-- Percorso file: "{matchId}/{timestamp}-{userId}.jpg" — l'INSERT controlla
-- che chi carica abbia una riga in match_registrations per quel matchId
-- (o sia admin). Riusa is_admin_storage(), già creata da storage-policies.sql.
drop policy if exists foto_partita_upload on storage.objects;
create policy foto_partita_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'foto-partite'
    and (
      exists (
        select 1 from public.match_registrations mr
        where mr.match_id::text = (storage.foldername(name))[1]
          and mr.user_id = auth.uid()
      )
      or public.is_admin_storage()
    )
  );

-- DELETE: chi ha caricato il file (owner, assegnato automaticamente da
-- Supabase Storage a chi fa l'upload) oppure admin.
drop policy if exists foto_partita_delete on storage.objects;
create policy foto_partita_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'foto-partite'
    and (owner = auth.uid() or public.is_admin_storage())
  );
