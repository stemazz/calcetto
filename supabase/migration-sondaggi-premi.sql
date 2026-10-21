-- ============================================================================
-- MIGRAZIONE — Sondaggi per i premi (sezione "Cassa e Premi")
-- Idempotente: rieseguibile senza danni.
--
-- Modello: l'admin crea un sondaggio custom (titolo + descrizione libera),
-- lo apre; tutti i giocatori ATTIVI possono votare un qualsiasi profilo
-- (giocatore, allenatore, cassiere o admin: nessuna restrizione), e possono
-- cambiare il proprio voto finché il sondaggio resta aperto. L'admin lo
-- chiude quando vuole: da quel momento i voti sono bloccati.
--
-- Anonimato: come per l'MVP, il SINGOLO voto (chi ha votato chi) resta
-- visibile solo al votante stesso e all'admin; a tutti gli altri arriva
-- solo il conteggio totale per candidato (vista_risultati_sondaggio).
-- Scelta di design: i risultati aggregati sono nascosti ai giocatori mentre
-- il sondaggio è ancora "aperto" (si vede solo "hai votato per X"), e
-- diventano visibili a tutti solo dopo la chiusura — per non influenzare il
-- voto di chi non ha ancora scelto. L'admin invece vede sempre i risultati
-- live, anche aperto, per decidere quando chiudere.
-- ============================================================================

create table if not exists public.sondaggi (
  id          uuid primary key default gen_random_uuid(),
  titolo      text not null check (length(trim(titolo)) > 0),
  descrizione text not null default '',
  stato       text not null default 'aperto' check (stato in ('aperto', 'chiuso')),
  creato_da   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  chiuso_at   timestamptz
);

create table if not exists public.sondaggio_voti (
  id           uuid primary key default gen_random_uuid(),
  sondaggio_id uuid not null references public.sondaggi(id) on delete cascade,
  votante_id   uuid not null references public.profiles(id) on delete cascade,
  votato_id    uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sondaggio_id, votante_id)
);
create index if not exists idx_sondaggio_voti_sondaggio on public.sondaggio_voti(sondaggio_id);

alter table public.sondaggi enable row level security;
alter table public.sondaggio_voti enable row level security;

drop policy if exists sondaggi_read on public.sondaggi;
create policy sondaggi_read on public.sondaggi for select to authenticated using (true);

-- Il proprio voto si legge sempre (per sapere chi hai votato e poterlo
-- cambiare); i voti altrui restano visibili solo all'admin.
drop policy if exists sondaggio_voti_read on public.sondaggio_voti;
create policy sondaggio_voti_read on public.sondaggio_voti for select to authenticated
  using (votante_id = auth.uid() or public.is_admin());
-- Le scritture passano solo dalle funzioni sotto (security definer).

grant select on public.sondaggi to authenticated;
grant select on public.sondaggio_voti to authenticated;

-- Risultati aggregati per candidato (il conteggio, non il dettaglio dei
-- singoli voti): una VIEW normale, come le altre già presenti in questo
-- progetto (es. vista_mvp_risultato), gira coi permessi di chi l'ha creata
-- e quindi bypassa la RLS della tabella sottostante — è così che tutti
-- possono vedere il totale senza vedere chi ha votato chi.
create or replace view public.vista_risultati_sondaggio as
  select sondaggio_id, votato_id, count(*)::int as num_voti
  from public.sondaggio_voti
  group by sondaggio_id, votato_id;
grant select on public.vista_risultati_sondaggio to authenticated;

-- --------------------------------- RPC -------------------------------------

-- Admin: crea un sondaggio custom, già aperto.
create or replace function public.crea_sondaggio(p_titolo text, p_descrizione text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuovo_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if length(trim(coalesce(p_titolo, ''))) = 0 then raise exception 'Il titolo è obbligatorio'; end if;
  insert into public.sondaggi(titolo, descrizione, creato_da)
    values (trim(p_titolo), coalesce(p_descrizione, ''), auth.uid())
    returning id into nuovo_id;
  return nuovo_id;
end; $$;
grant execute on function public.crea_sondaggio(text, text) to authenticated;

-- Qualsiasi giocatore ATTIVO: vota (o cambia voto) un profilo qualsiasi,
-- finché il sondaggio è aperto.
create or replace function public.vota_sondaggio(p_sondaggio uuid, p_votato uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and attivo) then
    raise exception 'Utente non attivo';
  end if;
  if not exists (select 1 from public.sondaggi where id = p_sondaggio and stato = 'aperto') then
    raise exception 'Il sondaggio non è (più) aperto';
  end if;
  insert into public.sondaggio_voti(sondaggio_id, votante_id, votato_id)
    values (p_sondaggio, auth.uid(), p_votato)
  on conflict (sondaggio_id, votante_id)
    do update set votato_id = excluded.votato_id, updated_at = now();
end; $$;
grant execute on function public.vota_sondaggio(uuid, uuid) to authenticated;

-- Admin: chiude il sondaggio (i voti restano bloccati da quel momento).
create or replace function public.chiudi_sondaggio(p_sondaggio uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update public.sondaggi set stato = 'chiuso', chiuso_at = now() where id = p_sondaggio;
end; $$;
grant execute on function public.chiudi_sondaggio(uuid) to authenticated;

-- Admin: riapre un sondaggio chiuso per errore.
create or replace function public.riapri_sondaggio(p_sondaggio uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update public.sondaggi set stato = 'aperto', chiuso_at = null where id = p_sondaggio;
end; $$;
grant execute on function public.riapri_sondaggio(uuid) to authenticated;

-- Admin: elimina un sondaggio (es. creato per errore) e tutti i suoi voti.
create or replace function public.elimina_sondaggio(p_sondaggio uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.sondaggi where id = p_sondaggio;
end; $$;
grant execute on function public.elimina_sondaggio(uuid) to authenticated;
