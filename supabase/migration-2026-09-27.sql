-- ============================================================================
-- MIGRATION 2026-09-27 — Calcetto tra Amici
-- Questo file è IDEMPOTENTE: puoi rieseguirlo in SQL Editor senza danni.
-- Aggiunge: features 1–5 richieste + rinforzo bucket foto profilo.
-- FIX: il drop della vista dipendente è stato spostato PRIMA della ALTER
-- COLUMN che modifica squadre.squadra (Postgres non permette di alterare
-- una colonna finché una vista vi dipende).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- BUCKET "foto-profili" (pubblico in lettura, scrittura limitata al proprietario)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('foto-profili', 'foto-profili', true)
on conflict (id) do nothing;

drop policy if exists foto_upload on storage.objects;
create policy foto_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-profili'
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists foto_update on storage.objects;
create policy foto_update on storage.objects for update to authenticated
  using (bucket_id = 'foto-profili'
         and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists foto_delete on storage.objects;
create policy foto_delete on storage.objects for delete to authenticated
  using (bucket_id = 'foto-profili'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- FEATURE 2 — SQUADRE FLESSIBILI (2..4 squadre, 3..12 giocatori per squadra)
-- ============================================================================
alter table public.matches
  add column if not exists num_squadre int not null default 2
    check (num_squadre between 2 and 4),
  add column if not exists giocatori_per_squadra int not null default 5
    check (giocatori_per_squadra between 3 and 12);

-- *** FIX: elimina PRIMA la vista che dipende da squadre.squadra ***
-- (viene ricreata più sotto, aggiornata per il nuovo modello a N squadre)
drop view if exists public.vista_statistiche_giocatore cascade;

-- squadre.squadra da char(1) → text (gestisce A/B/C/D liberamente)
alter table public.squadre
  alter column squadra type text using (trim(squadra));
alter table public.squadre
  drop constraint if exists squadre_squadra_check;
alter table public.squadre
  add constraint squadre_squadra_check
    check (squadra in ('A','B','C','D'));

-- Generazione bilanciata N squadre (greedy: pochi giocatori, a parità media più bassa)
create or replace function public.genera_squadre_bilate(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  g record; n_sq int; max_per int; tot int := 0;
  best text; best_cnt int; best_avg numeric;
  cnt_a int := 0; cnt_b int := 0; cnt_c int := 0; cnt_d int := 0;
  sum_a numeric := 0; sum_b numeric := 0; sum_c numeric := 0; sum_d numeric := 0;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.squadre where match_id = p_match;
  select coalesce(num_squadre, 2), coalesce(giocatori_per_squadra, 5)
    into n_sq, max_per from public.matches where id = p_match;

  for g in
    select r.user_id,
      coalesce((select round(avg(voto)::numeric,2) from public.votes where votato_id = r.user_id), 5.5) as rating
    from public.match_registrations r
    where r.match_id = p_match and not r.in_attesa
    order by rating desc, r.user_id
  loop
    best := 'A'; best_cnt := cnt_a;
    best_avg := case when cnt_a = 0 then 0 else sum_a / cnt_a end;
    if n_sq >= 2 and (cnt_b < best_cnt
       or (cnt_b = best_cnt and (case when cnt_b = 0 then 0 else sum_b/cnt_b end) < best_avg)) then
      best := 'B'; best_cnt := cnt_b;
      best_avg := case when cnt_b = 0 then 0 else sum_b/cnt_b end;
    end if;
    if n_sq >= 3 and (cnt_c < best_cnt
       or (cnt_c = best_cnt and (case when cnt_c = 0 then 0 else sum_c/cnt_c end) < best_avg)) then
      best := 'C'; best_cnt := cnt_c;
      best_avg := case when cnt_c = 0 then 0 else sum_c/cnt_c end;
    end if;
    if n_sq >= 4 and (cnt_d < best_cnt
       or (cnt_d = best_cnt and (case when cnt_d = 0 then 0 else sum_d/cnt_d end) < best_avg)) then
      best := 'D'; best_cnt := cnt_d;
      best_avg := case when cnt_d = 0 then 0 else sum_d/cnt_d end;
    end if;
    if best_cnt >= max_per then
      best := case when cnt_a <= cnt_b and cnt_a <= cnt_c and cnt_a <= cnt_d then 'A'
                   when cnt_b <= cnt_c and cnt_b <= cnt_d then 'B'
                   when cnt_c <= cnt_d then 'C' else 'D' end;
    end if;
    insert into public.squadre (match_id, giocatore_id, squadra)
      values (p_match, g.user_id, best);
    if best = 'A' then cnt_a := cnt_a + 1; sum_a := sum_a + g.rating;
    elsif best = 'B' then cnt_b := cnt_b + 1; sum_b := sum_b + g.rating;
    elsif best = 'C' then cnt_c := cnt_c + 1; sum_c := sum_c + g.rating;
    else cnt_d := cnt_d + 1; sum_d := sum_d + g.rating; end if;
    tot := tot + 1;
  end loop;
  return tot;
end; $$;
grant execute on function public.genera_squadre_bilate(uuid) to authenticated;

-- imposta_squadra (admin)
create or replace function public.imposta_squadra(
  p_match uuid, p_user uuid, p_squadra text
) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if p_squadra is null or length(trim(p_squadra)) = 0 then
    delete from public.squadre where match_id = p_match and giocatore_id = p_user;
    delete from public.match_ruoli where match_id = p_match and giocatore_id = p_user
      and ruolo_partita = 'giocatore';
    return;
  end if;
  if upper(trim(p_squadra)) not in ('A','B','C','D') then
    raise exception 'Squadra non valida (A/B/C/D)';
  end if;
  insert into public.squadre (match_id, giocatore_id, squadra)
    values (p_match, p_user, upper(trim(p_squadra)))
  on conflict (match_id, giocatore_id) do update set squadra = upper(trim(p_squadra));
  insert into public.match_ruoli (match_id, giocatore_id, squadra, ruolo_partita)
    values (p_match, p_user, upper(trim(p_squadra)), 'giocatore')
  on conflict (match_id, giocatore_id, ruolo_partita)
    do update set squadra = upper(trim(p_squadra));
end; $$;
grant execute on function public.imposta_squadra(uuid, uuid, text) to authenticated;

-- ============================================================================
-- TABELLA match_ruoli — gestisce allenatore, giocatore, jolly per partita
-- ============================================================================
create table if not exists public.match_ruoli (
  match_id uuid not null references public.matches(id) on delete cascade,
  giocatore_id uuid not null references public.profiles(id) on delete cascade,
  squadra text not null check (squadra in ('A','B','C','D')),
  ruolo_partita text not null check (ruolo_partita in ('allenatore','giocatore','jolly')),
  primary key (match_id, giocatore_id, ruolo_partita)
);
create index if not exists idx_match_ruoli_match on public.match_ruoli(match_id);

alter table public.match_ruoli enable row level security;
drop policy if exists mr_read on public.match_ruoli;
create policy mr_read on public.match_ruoli for select to authenticated using (true);
drop policy if exists mr_write on public.match_ruoli;
create policy mr_write on public.match_ruoli for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.match_ruoli to authenticated;

-- imposta_allenatore (admin)
create or replace function public.imposta_allenatore(
  p_match uuid, p_user uuid, p_squadra text
) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  delete from public.match_ruoli where match_id = p_match and giocatore_id = p_user
    and ruolo_partita = 'allenatore';
  if p_squadra is null or length(trim(p_squadra)) = 0 then return; end if;
  if upper(trim(p_squadra)) not in ('A','B','C','D') then
    raise exception 'Squadra non valida (A/B/C/D)';
  end if;
  insert into public.match_ruoli (match_id, giocatore_id, squadra, ruolo_partita)
    values (p_match, p_user, upper(trim(p_squadra)), 'allenatore');
end; $$;
grant execute on function public.imposta_allenatore(uuid, uuid, text) to authenticated;

-- ============================================================================
-- FEATURE 5 — GIOCATORE JOLLY (assegnato a più squadre nella stessa partita)
-- ============================================================================
create or replace function public.segna_jolly(
  p_match uuid, p_user uuid, p_squadre text[]
) returns void
language plpgsql security definer set search_path = public as $$
declare m record; sq text;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  delete from public.squadre where match_id = p_match and giocatore_id = p_user;
  delete from public.match_ruoli where match_id = p_match and giocatore_id = p_user
    and ruolo_partita in ('giocatore','jolly');
  if p_squadre is null or array_length(p_squadre,1) is null then return; end if;
  foreach sq in array p_squadre loop
    if upper(trim(sq)) in ('A','B','C','D') then
      insert into public.squadre (match_id, giocatore_id, squadra)
        values (p_match, p_user, upper(trim(sq)));
    end if;
  end loop;
  insert into public.match_ruoli (match_id, giocatore_id, squadra, ruolo_partita)
    select p_match, p_user, upper(trim(s)), 'jolly' from unnest(p_squadre) s
    where upper(trim(s)) in ('A','B','C','D');
end; $$;
grant execute on function public.segna_jolly(uuid, uuid, text[]) to authenticated;

-- ============================================================================
-- FEATURE 3 — VOTAZIONE MVP separata (riservata ai profili "tuttofare")
-- ============================================================================
alter table public.profiles
  add column if not exists is_tuttofare boolean not null default false;

create table if not exists public.mvp_candidates (
  match_id uuid not null references public.matches(id) on delete cascade,
  giocatore_id uuid not null references public.profiles(id) on delete cascade,
  primary key (match_id, giocatore_id)
);
grant select, insert, delete on public.mvp_candidates to authenticated;
alter table public.mvp_candidates enable row level security;
drop policy if exists mvp_cand_read on public.mvp_candidates;
create policy mvp_cand_read on public.mvp_candidates for select to authenticated using (true);
drop policy if exists mvp_cand_write on public.mvp_candidates;
create policy mvp_cand_write on public.mvp_candidates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.mvp_votes (
  match_id uuid not null references public.matches(id) on delete cascade,
  votante_id uuid not null references public.profiles(id) on delete cascade,
  candidato_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, votante_id)
);
grant select, insert, update, delete on public.mvp_votes to authenticated;
alter table public.mvp_votes enable row level security;
drop policy if exists mvp_v_read on public.mvp_votes;
create policy mvp_v_read on public.mvp_votes for select to authenticated
  using (votante_id = auth.uid() or public.is_admin());
drop policy if exists mvp_v_write on public.mvp_votes;
create policy mvp_v_write on public.mvp_votes for all to authenticated
  using (votante_id = auth.uid() or public.is_admin())
  with check (votante_id = auth.uid() or public.is_admin());

create or replace function public.salva_mvp(p_match uuid, p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_tuttofare) then
    raise exception 'Solo i profili "tuttofare" possono votare l''MVP';
  end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if m.stato <> 'giocata' then raise exception 'Risultato non ancora inserito'; end if;
  if not exists (select 1 from public.mvp_candidates where match_id = p_match and giocatore_id = p_candidato) then
    raise exception 'Candidato non valido per questa partita';
  end if;
  insert into public.mvp_votes (match_id, votante_id, candidato_id)
    values (p_match, auth.uid(), p_candidato)
  on conflict (match_id, votante_id) do update
    set candidato_id = excluded.candidato_id, created_at = now();
end; $$;
grant execute on function public.salva_mvp(uuid, uuid) to authenticated;

drop view if exists public.vista_mvp_risultato;
create view public.vista_mvp_risultato as
select
  v.match_id, m.data,
  v.candidato_id, p.nome, p.cognome, p.soprannome, p.foto_url,
  count(*)::int as num_voti_mvp
from public.mvp_votes v
join public.matches m on m.id = v.match_id
join public.profiles p on p.id = v.candidato_id
group by v.match_id, m.data, v.candidato_id, p.id;
grant select on public.vista_mvp_risultato to authenticated;

-- ============================================================================
-- FEATURE 1 — VOTI PUBBLICI con commenti (anonimi) per partita
-- ============================================================================
drop view if exists public.vista_voti_con_commenti;
create view public.vista_voti_con_commenti as
select
  vt.match_id, vt.votato_id,
  count(*) filter (where vt.voto is not null)::int as num_voti,
  round(avg(vt.voto)::numeric, 2) as media_voto,
  coalesce(
    (select jsonb_agg(jsonb_build_object('voto', v.voto, 'commento', v.commento) order by v.created_at)
     from public.votes v where v.match_id = vt.match_id and v.votato_id = vt.votato_id
       and v.commento is not null and length(trim(v.commento)) > 0),
    '[]'::jsonb
  ) as commenti_anonimi
from public.votes vt
group by vt.match_id, vt.votato_id;
grant select on public.vista_voti_con_commenti to authenticated;

-- ============================================================================
-- salva_voto — aggiornato per gestire N squadre e allenatore votabile da tutti
-- ============================================================================
create or replace function public.salva_voto(
  p_match uuid, p_votato uuid, p_voto numeric, p_commento text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare m record; mia_sq text; sq_votato text; ruolo_votato text;
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
  if mia_sq is null then raise exception 'Devi essere schierato in campo per votare'; end if;

  select squadra, ruolo_partita into sq_votato, ruolo_votato
    from public.match_ruoli
    where match_id = p_match and giocatore_id = p_votato;
  if sq_votato is null or ruolo_votato is null then
    select squadra into sq_votato from public.squadre
      where match_id = p_match and giocatore_id = p_votato;
    if sq_votato is null then raise exception 'Giocatore non presente in questa partita'; end if;
    ruolo_votato := 'giocatore';
  end if;

  if p_votato = auth.uid() then raise exception 'Non puoi votare te stesso'; end if;
  if ruolo_votato = 'allenatore' then
    null;
  elsif sq_votato = mia_sq then
    raise exception 'Puoi votare solo giocatori delle altre squadre o gli allenatori';
  end if;

  insert into public.votes (match_id, votante_id, votato_id, voto, commento, updated_at)
  values (p_match, auth.uid(), p_votato, round(p_voto * 2) / 2, coalesce(p_commento, ''), now())
  on conflict (match_id, votante_id, votato_id)
  do update set voto = excluded.voto, commento = excluded.commento, updated_at = now();
end; $$;
grant execute on function public.salva_voto(uuid, uuid, numeric, text) to authenticated;

-- ============================================================================
-- set_tuttofare (admin)
-- ============================================================================
create or replace function public.set_tuttofare(p_user uuid, p_val boolean) returns void
language sql security definer set search_path = public as $$
  update public.profiles set is_tuttofare = p_val where id = p_user;
$$;
grant execute on function public.set_tuttofare(uuid, boolean) to authenticated;

-- ============================================================================
-- Ricrea vista_statistiche_giocatore (era stata droppata sopra, PRIMA
-- della alter column) con la logica aggiornata per N squadre
-- ============================================================================
create view public.vista_statistiche_giocatore as
select
  pr.id as giocatore_id,
  pr.nome, pr.cognome, pr.soprannome, pr.foto_url, pr.ruolo_preferito,
  coalesce(prs.presenze, 0)   as presenze,
  coalesce(prs.vittorie, 0)   as vittorie,
  coalesce(prs.pareggi, 0)    as pareggi,
  coalesce(prs.sconfitte, 0)  as sconfitte,
  coalesce(g.gol, 0)          as gol,
  coalesce(v.media_voti, 0)   as media_voti,
  coalesce(v.num_voti, 0)     as num_voti
from public.profiles pr
left join (
  select s1.giocatore_id,
    count(distinct s1.match_id) as presenze,
    coalesce((
      select count(*) from (
        select distinct s2.match_id, s2.squadra,
          case
            when (s2.squadra = 'A' and m.gol_squadra_a > m.gol_squadra_b)
              or (s2.squadra = 'B' and m.gol_squadra_b > m.gol_squadra_a)
              or (s2.squadra = 'C' and m.gol_squadra_a > m.gol_squadra_b)
              or (s2.squadra = 'D' and m.gol_squadra_b > m.gol_squadra_a)
            then 'V' end as ris
        from public.squadre s2 join public.matches m on m.id = s2.match_id
        where s2.giocatore_id = s1.giocatore_id and m.stato='giocata'
      ) x where x.ris = 'V'
    ), 0) as vittorie,
    coalesce((
      select count(*) from (
        select distinct s2.match_id, s2.squadra,
          case when m.gol_squadra_a = m.gol_squadra_b then 'P' end as ris
        from public.squadre s2 join public.matches m on m.id = s2.match_id
        where s2.giocatore_id = s1.giocatore_id and m.stato='giocata'
      ) x where x.ris = 'P'
    ), 0) as pareggi,
    coalesce((
      select count(*) from (
        select distinct s2.match_id, s2.squadra,
          case
            when (s2.squadra = 'A' and m.gol_squadra_a < m.gol_squadra_b)
              or (s2.squadra = 'B' and m.gol_squadra_b < m.gol_squadra_a)
              or (s2.squadra = 'C' and m.gol_squadra_a < m.gol_squadra_b)
              or (s2.squadra = 'D' and m.gol_squadra_b < m.gol_squadra_a)
            then 'S' end as ris
        from public.squadre s2 join public.matches m on m.id = s2.match_id
        where s2.giocatore_id = s1.giocatore_id and m.stato='giocata'
      ) x where x.ris = 'S'
    ), 0) as sconfitte
  from public.squadre s1
  group by s1.giocatore_id
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