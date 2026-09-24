-- ============================================================================
-- CALCETTO FRA AMICI — Schema database (Supabase / PostgreSQL)
-- Esegui questo file nell'SQL Editor di Supabase (una sola volta).
-- Tutto è idempotente: puoi rieseguirlo senza danni.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- IMPOSTAZIONI globali (parametri modificabili dall'area Admin)
-- ----------------------------------------------------------------------------
create table if not exists public.impostazioni (
  id int primary key default 1 check (id = 1),
  votazione_ore int not null default 48,          -- ore di apertura votazioni
  min_partite_classifica int not null default 3,  -- min. partite per la classifica
  posti_default int not null default 10,          -- posti predefiniti per partita
  updated_at timestamptz not null default now()
);
insert into public.impostazioni (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- PROFILI giocatori (1 a 1 con gli utenti di autenticazione)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null,
  cognome text not null default '',
  soprannome text not null default '',
  foto_url text,
  ruolo_preferito text check (ruolo_preferito in ('portiere','difensore','centrocampista','attaccante')),
  piede_preferito text check (piede_preferito in ('destro','sinistro','ambidestro')),
  is_admin boolean not null default false,
  is_demo boolean not null default false,   -- profili di esempio, eliminabili
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Creazione automatica del profilo alla registrazione
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome, cognome, soprannome)
  values (
    new.id, new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'cognome',''),
    coalesce(new.raw_user_meta_data->>'soprannome','')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: l'utente corrente è admin? (security definer per evitare ricorsioni RLS)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin and attivo
  );
$$;

-- Helper: un utente è un profilo demo? (security definer, evita ricorsioni RLS)
create or replace function public.is_demo_user(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_demo from public.profiles where id = p), false);
$$;

-- ----------------------------------------------------------------------------
-- PARTITE
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  ora time not null default '19:00',
  luogo text not null default '',
  max_giocatori int not null default 10,
  stato text not null default 'programmata'
    check (stato in ('programmata','giocata','annullata')),
  gol_squadra_a int,
  gol_squadra_b int,
  votazione_aperta boolean not null default false,
  votazione_scadenza timestamptz,   -- null = chiusa manualmente / senza scadenza
  is_demo boolean not null default false, -- partite di esempio, eliminabili
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_matches_data on public.matches(data);

-- ----------------------------------------------------------------------------
-- ISCRIZIONI alle partite (+ lista d'attesa)
-- ----------------------------------------------------------------------------
create table if not exists public.match_registrations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  in_attesa boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
create index if not exists idx_reg_match on public.match_registrations(match_id);

-- Quando un iscritto lascia il posto, il primo della lista d'attesa entra
create or replace function public.promuovi_dalla_lista() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_gioc int; primo record; n_iscritti int;
begin
  select max_giocatori into max_gioc from public.matches where id = old.match_id;
  select count(*) into n_iscritti
    from public.match_registrations where match_id = old.match_id and not in_attesa;
  if n_iscritti < max_gioc then
    select id into primo from public.match_registrations
      where match_id = old.match_id and in_attesa
      order by created_at limit 1;
    if primo.id is not null then
      update public.match_registrations set in_attesa = false where id = primo.id;
    end if;
  end if;
  return old;
end; $$;

drop trigger if exists trg_promuovi_lista on public.match_registrations;
create trigger trg_promuovi_lista
  after delete on public.match_registrations
  for each row execute function public.promuovi_dalla_lista();

-- ----------------------------------------------------------------------------
-- SQUADRE (assegnazione giocatori per partita)
-- ----------------------------------------------------------------------------
create table if not exists public.squadre (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  giocatore_id uuid not null references public.profiles(id) on delete cascade,
  squadra char(1) not null check (squadra in ('A','B')),
  unique (match_id, giocatore_id)
);
create index if not exists idx_squadre_match on public.squadre(match_id);

-- ----------------------------------------------------------------------------
-- MARCATORI (gol; autogol = segnalato a parte, non conta in classifica cannonieri)
-- ----------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  giocatore_id uuid not null references public.profiles(id) on delete cascade,
  autogol boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_goals_match on public.goals(match_id);

-- ----------------------------------------------------------------------------
-- VOTI (anonimi: i giocatori vedono solo i propri; admin vede tutto)
-- ----------------------------------------------------------------------------
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  votante_id uuid not null references public.profiles(id) on delete cascade,
  votato_id uuid not null references public.profiles(id) on delete cascade,
  voto numeric(3,1) not null check (voto >= 1 and voto <= 10),
  commento text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, votante_id, votato_id),
  check (votante_id <> votato_id)
);
create index if not exists idx_votes_votato on public.votes(votato_id);
create index if not exists idx_votes_match on public.votes(match_id);

-- ============================================================================
-- RLS — sicurezza a livello di riga
-- ============================================================================
alter table public.impostazioni enable row level security;
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_registrations enable row level security;
alter table public.squadre enable row level security;
alter table public.goals enable row level security;
alter table public.votes enable row level security;

-- impostazioni: lettura a tutti gli autenticati, scrittura solo admin
drop policy if exists imp_read on public.impostazioni;
create policy imp_read on public.impostazioni for select to authenticated using (true);
drop policy if exists imp_write on public.impostazioni;
create policy imp_write on public.impostazioni for update to authenticated using (public.is_admin());

-- profiles: lettura a tutti gli autenticati; ognuno modifica solo il proprio profilo
drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select to authenticated using (true);
drop policy if exists prof_update_own on public.profiles;
create policy prof_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_admin = public.is_admin()
    and is_demo = public.is_demo_user(auth.uid())
  );
drop policy if exists prof_update_admin on public.profiles;
create policy prof_update_admin on public.profiles for update to authenticated
  using (public.is_admin());

-- matches: lettura a tutti, scrittura solo admin
drop policy if exists match_read on public.matches;
create policy match_read on public.matches for select to authenticated using (true);
drop policy if exists match_write on public.matches;
create policy match_write on public.matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- iscrizioni: lettura a tutti; ognuno gestisce la propria; admin tutto
drop policy if exists reg_read on public.match_registrations;
create policy reg_read on public.match_registrations for select to authenticated using (true);
drop policy if exists reg_own on public.match_registrations;
create policy reg_own on public.match_registrations for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- squadre e gol: sola lettura per i giocatori, admin scrive
drop policy if exists sq_read on public.squadre;
create policy sq_read on public.squadre for select to authenticated using (true);
drop policy if exists sq_write on public.squadre;
create policy sq_write on public.squadre for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists gol_read on public.goals;
create policy gol_read on public.goals for select to authenticated using (true);
drop policy if exists gol_write on public.goals;
create policy gol_write on public.goals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- voti: lettura SOLO dei propri voti (o admin); scrittura dei propri; admin tutto
drop policy if exists vot_read on public.votes;
create policy vot_read on public.votes for select to authenticated
  using (votante_id = auth.uid() or public.is_admin());
drop policy if exists vot_write on public.votes;
create policy vot_write on public.votes for all to authenticated
  using (votante_id = auth.uid() or public.is_admin())
  with check (votante_id = auth.uid() or public.is_admin());

-- ============================================================================
-- VISTE pubbliche (nascondono CHI ha votato; mostrano solo voti e medie)
-- ============================================================================
-- Tutti i voti senza il nome di chi li ha dati (anonimato)
drop view if exists public.vista_voti_pubblici;
create view public.vista_voti_pubblici as
  select match_id, votato_id, voto, commento
  from public.votes;
grant select on public.vista_voti_pubblici to authenticated;

-- Statistiche aggregate per giocatore (presenze, gol, V/P/S, media voti)
drop view if exists public.vista_statistiche_giocatore;
create view public.vista_statistiche_giocatore as
select
  pr.id as giocatore_id,
  pr.nome, pr.cognome, pr.soprannome, pr.foto_url, pr.ruolo_preferito,
  coalesce(prs.presenze, 0)  as presenze,
  coalesce(prs.vittorie, 0)  as vittorie,
  coalesce(prs.pareggi, 0)   as pareggi,
  coalesce(prs.sconfitte, 0) as sconfitte,
  coalesce(g.gol, 0)         as gol,
  coalesce(v.media_voti, 0)  as media_voti,
  coalesce(v.num_voti, 0)    as num_voti
from public.profiles pr
left join (
  select s.giocatore_id,
    count(distinct s.match_id) as presenze,
    count(distinct case when m.gol_squadra_a is not null and m.stato = 'giocata' and
      ((s.squadra = 'A' and m.gol_squadra_a > m.gol_squadra_b) or
       (s.squadra = 'B' and m.gol_squadra_b > m.gol_squadra_a)) then s.match_id end) as vittorie,
    count(distinct case when m.gol_squadra_a is not null and m.stato = 'giocata' and
      m.gol_squadra_a = m.gol_squadra_b then s.match_id end) as pareggi,
    count(distinct case when m.gol_squadra_a is not null and m.stato = 'giocata' and
      ((s.squadra = 'A' and m.gol_squadra_a < m.gol_squadra_b) or
       (s.squadra = 'B' and m.gol_squadra_b < m.gol_squadra_a)) then s.match_id end) as sconfitte
  from public.squadre s
  join public.matches m on m.id = s.match_id
  group by s.giocatore_id
) prs on prs.giocatore_id = pr.id
left join (
  select giocatore_id, count(*) as gol
  from public.goals where not autogol group by giocatore_id
) g on g.giocatore_id = pr.id
left join (
  select votato_id, round(avg(voto)::numeric, 2) as media_voti, count(*) as num_voti
  from public.votes group by votato_id
) v on v.votato_id = pr.id;
grant select on public.vista_statistiche_giocatore to authenticated;

-- Media voti ricevuti per partita (per grafico andamento e MVP)
drop view if exists public.vista_voti_per_partita;
create view public.vista_voti_per_partita as
select
  vt.match_id, m.data, vt.votato_id,
  round(avg(vt.voto)::numeric, 2) as media_voto,
  count(*) as num_voti
from public.votes vt
join public.matches m on m.id = vt.match_id
group by vt.match_id, m.data, vt.votato_id;
grant select on public.vista_voti_per_partita to authenticated;

-- MVP di ogni partita (miglior media voti)
drop view if exists public.vista_mvp_partita;
create view public.vista_mvp_partita as
select
  vp.match_id, m.data,
  vp.votato_id as giocatore_id,
  pr.nome, pr.cognome, pr.soprannome, pr.foto_url,
  vp.media_voto, vp.num_voti,
  row_number() over (
    partition by vp.match_id
    order by vp.media_voto desc, vp.num_voti desc
  ) as pos
from public.vista_voti_per_partita vp
join public.matches m on m.id = vp.match_id
join public.profiles pr on pr.id = vp.votato_id
where m.stato = 'giocata';
grant select on public.vista_mvp_partita to authenticated;

-- ============================================================================
-- FUNZIONI RPC (security definer — validazioni lato server)
-- ============================================================================

-- Chiude automaticamente le votazioni scadute (chiamata dall'app all'avvio)
create or replace function public.aggiorna_stato_votazioni() returns void
language sql security definer set search_path = public as $$
  update public.matches
  set votazione_aperta = false
  where votazione_aperta and votazione_scadenza is not null and votazione_scadenza < now();
$$;
grant execute on function public.aggiorna_stato_votazioni() to authenticated;

-- Iscrizione a una partita (gestisce lista d'attesa)
create or replace function public.iscriviti_partita(p_match uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  m record; n int;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if m.stato <> 'programmata' then raise exception 'Iscrizioni chiuse per questa partita'; end if;
  if exists (select 1 from public.match_registrations where match_id = p_match and user_id = auth.uid())
  then raise exception 'Sei già iscritto a questa partita'; end if;

  select count(*) into n from public.match_registrations
    where match_id = p_match and not in_attesa;

  if n < m.max_giocatori then
    insert into public.match_registrations (match_id, user_id, in_attesa)
    values (p_match, auth.uid(), false);
    return 'iscritto';
  else
    insert into public.match_registrations (match_id, user_id, in_attesa)
    values (p_match, auth.uid(), true);
    return 'lista_attesa';
  end if;
end; $$;
grant execute on function public.iscriviti_partita(uuid) to authenticated;

-- Cancellazione dalla partita (il trigger promuove il primo in lista d'attesa)
create or replace function public.cancellati_partita(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.match_registrations
  where match_id = p_match and user_id = auth.uid();
  if not found then raise exception 'Non sei iscritto a questa partita'; end if;
end; $$;
grant execute on function public.cancellati_partita(uuid) to authenticated;

-- Iscrizione manuale da parte dell'admin
create or replace function public.iscrivi_manuale(p_match uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m record; n int;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select * into m from public.matches where id = p_match;
  if m.stato <> 'programmata' then raise exception 'Iscrizioni chiuse'; end if;
  if exists (select 1 from public.match_registrations where match_id = p_match and user_id = p_user)
  then raise exception 'Già iscritto'; end if;
  select count(*) into n from public.match_registrations
    where match_id = p_match and not in_attesa;
  if n < m.max_giocatori then
    insert into public.match_registrations (match_id, user_id, in_attesa) values (p_match, p_user, false);
    return 'iscritto';
  else
    insert into public.match_registrations (match_id, user_id, in_attesa) values (p_match, p_user, true);
    return 'lista_attesa';
  end if;
end; $$;
grant execute on function public.iscrivi_manuale(uuid, uuid) to authenticated;

-- Rimozione manuale di un giocatore (admin) — il trigger promuove dalla lista
create or replace function public.rimuovi_da_partita(p_match uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.match_registrations where match_id = p_match and user_id = p_user;
$$;
grant execute on function public.rimuovi_da_partita(uuid, uuid) to authenticated;

-- Genera squadre bilanciate in base alla media voti (algoritmo greedy)
create or replace function public.genera_squadre_bilate(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  g record; a_count int := 0; b_count int := 0;
  a_sum numeric := 0; b_sum numeric := 0; tot int := 0;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.squadre where match_id = p_match;
  -- media voti di carriera per ciascun iscritto (esclusa lista d'attesa)
  for g in
    select r.user_id,
      coalesce((select round(avg(voto)::numeric, 2) from public.votes where votato_id = r.user_id), 5.5) as rating
    from public.match_registrations r
    where r.match_id = p_match and not r.in_attesa
    order by rating desc, r.user_id
  loop
    tot := tot + 1;
    -- Assegna alla squadra con meno giocatori; a parità di numero,
    -- a quella con media voti inferiore (squadre più equilibrate).
    if a_count = 0 or a_count < b_count
       or (a_count = b_count and a_sum / a_count <= b_sum / b_count) then
      insert into public.squadre (match_id, giocatore_id, squadra) values (p_match, g.user_id, 'A');
      a_count := a_count + 1; a_sum := a_sum + g.rating;
    else
      insert into public.squadre (match_id, giocatore_id, squadra) values (p_match, g.user_id, 'B');
      b_count := b_count + 1; b_sum := b_sum + g.rating;
    end if;
  end loop;
  return tot;
end; $$;
grant execute on function public.genera_squadre_bilate(uuid) to authenticated;

-- Salva/modifica un voto (valida: partecipazione, squadra avversaria, votazione aperta)
create or replace function public.salva_voto(
  p_match uuid, p_votato uuid, p_voto numeric, p_commento text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare m record; mia_sq char(1); sq_votato char(1);
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if p_voto < 1 or p_voto > 10 then raise exception 'Voto non valido (1-10)'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if m.stato <> 'giocata' then raise exception 'Risultato non ancora inserito'; end if;
  if not m.votazione_aperta then raise exception 'La votazione non è aperta'; end if;
  if m.votazione_scadenza is not null and m.votazione_scadenza < now()
  then raise exception 'La votazione è scaduta'; end if;

  select squadra into mia_sq from public.squadre
    where match_id = p_match and giocatore_id = auth.uid();
  if mia_sq is null then raise exception 'Hai partecipato solo se sei stato schierato: votazione non consentita'; end if;

  select squadra into sq_votato from public.squadre
    where match_id = p_match and giocatore_id = p_votato;
  if sq_votato is null then raise exception 'Giocatore non presente in questa partita'; end if;
  if p_votato = auth.uid() then raise exception 'Non puoi votare te stesso'; end if;
  if sq_votato = mia_sq then raise exception 'Puoi votare solo i giocatori della squadra avversaria'; end if;

  -- arrotonda ai mezzi punti (6.3 -> 6.5, 6.2 -> 6.0)
  insert into public.votes (match_id, votante_id, votato_id, voto, commento, updated_at)
  values (p_match, auth.uid(), p_votato, round(p_voto * 2) / 2, coalesce(p_commento, ''), now())
  on conflict (match_id, votante_id, votato_id)
  do update set voto = excluded.voto, commento = excluded.commento, updated_at = now();
end; $$;
grant execute on function public.salva_voto(uuid, uuid, numeric, text) to authenticated;

-- Admin: inserisce risultato e marcatori, e apre la votazione
-- p_marcatori: jsonb array [{ "user_id": "...", "gol": 2, "autogol": false }]
create or replace function public.imposta_risultato(
  p_match uuid, p_gol_a int, p_gol_b int, p_marcatori jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare ore int;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update public.matches
    set gol_squadra_a = p_gol_a, gol_squadra_b = p_gol_b, stato = 'giocata'
    where id = p_match;
  delete from public.goals where match_id = p_match;
  if p_marcatori is not null then
    insert into public.goals (match_id, giocatore_id, autogol)
    select p_match, (x->>'user_id')::uuid, coalesce((x->>'autogol')::boolean, false)
    from jsonb_array_elements(p_marcatori) x,
         generate_series(1, greatest(coalesce((x->>'gol')::int, 1), 1));
  end if;
  select votazione_ore into ore from public.impostazioni where id = 1;
  update public.matches
    set votazione_aperta = true,
        votazione_scadenza = now() + make_interval(hours => ore)
    where id = p_match;
end; $$;
grant execute on function public.imposta_risultato(uuid, int, int, jsonb) to authenticated;

-- Admin: apri / chiudi / riapri votazione
create or replace function public.gestisci_votazione(p_match uuid, p_azione text) returns void
language plpgsql security definer set search_path = public as $$
declare ore int;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select votazione_ore into ore from public.impostazioni where id = 1;
  if p_azione = 'apri' then
    update public.matches set votazione_aperta = true,
      votazione_scadenza = now() + make_interval(hours => ore) where id = p_match;
  elsif p_azione = 'chiudi' then
    update public.matches set votazione_aperta = false, votazione_scadenza = null where id = p_match;
  elsif p_azione = 'riapri' then
    update public.matches set votazione_aperta = true,
      votazione_scadenza = now() + make_interval(hours => ore) where id = p_match;
  else raise exception 'Azione non valida'; end if;
end; $$;
grant execute on function public.gestisci_votazione(uuid, text) to authenticated;

-- Admin: elimina TUTTI i dati di esempio (partite demo + profili demo)
create or replace function public.elimina_dati_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.matches where is_demo;
  delete from auth.users where id in (select id from public.profiles where is_demo);
end; $$;
grant execute on function public.elimina_dati_demo() to authenticated;

-- Admin: elimina definitivamente un utente (anche demo)
create or replace function public.elimina_utente(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if p_user = auth.uid() then raise exception 'Non puoi eliminare il tuo account'; end if;
  delete from auth.users where id = p_user;
end; $$;
grant execute on function public.elimina_utente(uuid) to authenticated;

-- Admin: reset password di un utente
create or replace function public.reset_password(p_user uuid, p_nuova text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if length(p_nuova) < 6 then raise exception 'Password troppo corta (min 6 caratteri)'; end if;
  update auth.users set encrypted_password = crypt(p_nuova, gen_salt('bf'))
    where id = p_user;
end; $$;
grant execute on function public.reset_password(uuid, text) to authenticated;

-- Admin: cambia email di un utente (auth + profilo)
create or replace function public.cambia_email(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update auth.users set email = p_email where id = p_user;
  update public.profiles set email = p_email where id = p_user;
end; $$;
grant execute on function public.cambia_email(uuid, text) to authenticated;

-- Admin: promuove/retrocede un admin
create or replace function public.promuovi_admin(p_user uuid, p_admin boolean) returns void
language sql security definer set search_path = public as $$
  update public.profiles set is_admin = p_admin where id = p_user;
$$;
grant execute on function public.promuovi_admin(uuid, boolean) to authenticated;

-- ============================================================================
-- STORAGE: bucket pubblico per le foto profilo
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('foto-profili', 'foto-profili', true)
on conflict (id) do nothing;

drop policy if exists foto_upload on storage.objects;
create policy foto_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-profili' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists foto_update on storage.objects;
create policy foto_update on storage.objects for update to authenticated
  using (bucket_id = 'foto-profili' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists foto_delete on storage.objects;
create policy foto_delete on storage.objects for delete to authenticated
  using (bucket_id = 'foto-profili' and (storage.foldername(name))[1] = auth.uid()::text);
-- bucket pubblico: lettura libera via URL pubblico, nessuna policy di select necessaria

-- ============================================================================
-- PERMESSI di base (Supabase li dà di default; espliciti per chiarezza)
-- ============================================================================
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
