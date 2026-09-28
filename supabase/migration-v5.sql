-- ============================================================================
-- MIGRATION v5 — Calcetto tra Amici
-- Eseguire ONCE nel SQL Editor di Supabase. Idempotente.
-- Ordine: DROP VIEW CASCADE → ALTER column → CREATE → RPC → bucket/policy
-- ============================================================================
create extension if not exists pgcrypto;

-- ============================================================================
-- 1) DROP delle viste che dipendono da public.squadre.squadra
--    (altrimenti la ALTER COLUMN successiva fallisce con
--     "cannot alter type of a column used by a view or rule")
-- ============================================================================
drop view if exists public.vista_mvp_partita         cascade;
drop view if exists public.vista_voti_con_commenti   cascade;
drop view if exists public.vista_statistiche_giocatore cascade;
drop view if exists public.vista_voti_per_partita    cascade;
drop view if exists public.vista_voti_pubblici       cascade;
drop view if exists public.vista_mvp_risultato       cascade;

-- ============================================================================
-- 2) ALTER colonna squadre.squadra, ADD nuove colonne matches
-- ============================================================================
alter table public.squadre
  alter column squadra type text using trim(squadra);

alter table public.squadre
  drop constraint if exists squadre_squadra_check;
alter table public.squadre
  add constraint squadre_squadra_check
    check (upper(squadra) in ('A','B','C','D'));

alter table public.matches
  add column if not exists num_squadre int not null default 2
    check (num_squadre between 2 and 4);
alter table public.matches
  add column if not exists giocatori_per_squadra int not null default 5
    check (giocatori_per_squadra between 3 and 12);

-- ============================================================================
-- 3) Nuove tabelle (allenatore, jolly, MVP)
-- ============================================================================
create table if not exists public.match_ruoli (
  match_id      uuid not null references public.matches(id)  on delete cascade,
  giocatore_id  uuid not null references public.profiles(id) on delete cascade,
  squadra       text not null check (upper(squadra) in ('A','B','C','D')),
  ruolo_partita text not null check (ruolo_partita in ('allenatore','giocatore','jolly')),
  primary key (match_id, giocatore_id, ruolo_partita)
);
create index if not exists idx_match_ruoli_match on public.match_ruoli(match_id);

create table if not exists public.mvp_candidates (
  match_id     uuid not null references public.matches(id)  on delete cascade,
  giocatore_id uuid not null references public.profiles(id) on delete cascade,
  primary key (match_id, giocatore_id)
);

create table if not exists public.mvp_votes (
  match_id     uuid not null references public.matches(id)  on delete cascade,
  votante_id   uuid not null references public.profiles(id) on delete cascade,
  candidato_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (match_id, votante_id)
);

alter table public.profiles
  add column if not exists is_tuttofare boolean not null default false;

-- grants
grant select, insert, update, delete on public.match_ruoli    to authenticated;
grant select, insert, update, delete on public.mvp_candidates to authenticated;
grant select, insert, update, delete on public.mvp_votes      to authenticated;

-- RLS nuove tabelle
alter table public.match_ruoli    enable row level security;
alter table public.mvp_candidates enable row level security;
alter table public.mvp_votes      enable row level security;

drop policy if exists mr_read   on public.match_ruoli;
create policy mr_read   on public.match_ruoli    for select to authenticated using (true);
drop policy if exists mr_write  on public.match_ruoli;
create policy mr_write  on public.match_ruoli    for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists mvp_cand_read  on public.mvp_candidates;
create policy mvp_cand_read  on public.mvp_candidates for select to authenticated using (true);
drop policy if exists mvp_cand_write on public.mvp_candidates;
create policy mvp_cand_write on public.mvp_candidates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists mvp_v_read  on public.mvp_votes;
create policy mvp_v_read  on public.mvp_votes for select to authenticated
  using (votante_id = auth.uid() or public.is_admin());
drop policy if exists mvp_v_write on public.mvp_votes;
create policy mvp_v_write on public.mvp_votes for all to authenticated
  using (votante_id = auth.uid() or public.is_admin())
  with check (votante_id = auth.uid() or public.is_admin());

-- ============================================================================
-- 4) Ricrea delle viste aggiornate al modello N-squadre
-- ============================================================================

-- 4.1 Statistiche globali giocatore: V/P/S contato per ogni (match, squadra).
--     1 presenza distinct(match_id) anche se un giocatore è jolly in N squadre.
create view public.vista_statistiche_giocatore as
with ris as (
  select s2.giocatore_id, s2.match_id, upper(s2.squadra) as sq,
         m.gol_squadra_a, m.gol_squadra_b, m.stato,
         case
           when m.gol_squadra_a is null or m.stato <> 'giocata' then null
           when m.gol_squadra_a = m.gol_squadra_b then 'P'
           when s2.squadra in ('A','C') and m.gol_squadra_a > m.gol_squadra_b then 'V'
           when s2.squadra in ('B','D') and m.gol_squadra_b > m.gol_squadra_a then 'V'
           when s2.squadra in ('A','C') and m.gol_squadra_a < m.gol_squadra_b then 'S'
           when s2.squadra in ('B','D') and m.gol_squadra_b < m.gol_squadra_a then 'S'
         end as risultat
  from public.squadre s2
  join public.matches m on m.id = s2.match_id
),
agg as (
  select giocatore_id,
         count(distinct match_id) as presenze,
         count(*) filter (where risultat = 'V')::int as vittorie,
         count(*) filter (where risultat = 'P')::int as pareggi,
         count(*) filter (where risultat = 'S')::int as sconfitte
  from ris group by giocatore_id
),
gol as (
  select giocatore_id, count(*)::int as gol
  from public.goals where not autogol group by giocatore_id
),
vot as (
  select votato_id, round(avg(voto)::numeric, 2) as media_voti, count(*)::int as num_voti
  from public.votes group by votato_id
)
select pr.id as giocatore_id,
       pr.nome, pr.cognome, pr.soprannome, pr.foto_url, pr.ruolo_preferito,
       coalesce(agg.presenze, 0)   as presenze,
       coalesce(agg.vittorie, 0)   as vittorie,
       coalesce(agg.pareggi, 0)    as pareggi,
       coalesce(agg.sconfitte, 0)  as sconfitte,
       coalesce(gol.gol, 0)        as gol,
       coalesce(vot.media_voti, 0) as media_voti,
       coalesce(vot.num_voti, 0)   as num_voti
from public.profiles pr
left join agg on agg.giocatore_id = pr.id
left join gol on gol.giocatore_id = pr.id
left join vot on vot.votato_id    = pr.id;
grant select on public.vista_statistiche_giocatore to authenticated;

-- 4.2 vista_voti_per_partita
create view public.vista_voti_per_partita as
select vt.match_id, m.data, vt.votato_id,
       round(avg(vt.voto)::numeric, 2) as media_voto,
       count(*)::int as num_voti
from public.votes vt
join public.matches m on m.id = vt.match_id
group by vt.match_id, m.data, vt.votato_id;
grant select on public.vista_voti_per_partita to authenticated;

-- 4.3 vista_voti_pubblici (anonimato)
create view public.vista_voti_pubblici as
  select match_id, votato_id, voto, commento
  from public.votes;
grant select on public.vista_voti_pubblici to authenticated;

-- 4.4 vista_voti_con_commenti (commenti anonimi JSON aggregati)
create view public.vista_voti_con_commenti as
select vt.match_id,
       vt.votato_id,
       count(*) filter (where vt.voto is not null)::int  as num_voti,
       round(avg(vt.voto)::numeric, 2)                   as media_voto,
       coalesce(
         (select jsonb_agg(
            jsonb_build_object('voto', v.voto,
                               'commento', v.commento,
                               'created_at', v.created_at)
            order by v.created_at)
          from public.votes v
          where v.match_id = vt.match_id
            and v.votato_id = vt.votato_id
            and v.commento is not null
            and length(trim(v.commento)) > 0),
         '[]'::jsonb
       ) as commenti_anonimi
from public.votes vt
group by vt.match_id, vt.votato_id;
grant select on public.vista_voti_con_commenti to authenticated;

-- 4.5 vista_mvp_partita (classifica 1-10 per media)
create view public.vista_mvp_partita as
select vp.match_id, m.data,
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

-- 4.6 vista_mvp_risultato (MVP scelta "tuttofare")
create view public.vista_mvp_risultato as
select v.match_id, m.data,
       v.candidato_id, p.nome, p.cognome, p.soprannome, p.foto_url,
       count(*)::int as num_voti_mvp
from public.mvp_votes v
join public.matches m on m.id = v.match_id
join public.profiles p on p.id = v.candidato_id
group by v.match_id, m.data, v.candidato_id, p.id;
grant select on public.vista_mvp_risultato to authenticated;

-- ============================================================================
-- 5) RPC aggiornate per N squadre e jolly/allenatore/MVP
-- ============================================================================
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and is_admin and attivo);
$$;

create or replace function public.is_admin_storage() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and is_admin and attivo);
$$;
grant execute on function public.is_admin_storage() to authenticated;

create or replace function public.genera_squadre_bilate(p_match uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare g record; n_sq int; max_per int; tot int := 0;
        letters text[] := array['A','B','C','D'];
        best text; best_cnt int; best_avg numeric;
        cnt_a int := 0; cnt_b int := 0; cnt_c int := 0; cnt_d int := 0;
        sum_a numeric := 0; sum_b numeric := 0;
        sum_c numeric := 0; sum_d numeric := 0;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.squadre where match_id = p_match;
  delete from public.match_ruoli where match_id = p_match;
  select coalesce(num_squadre,2), coalesce(giocatori_per_squadra,5)
    into n_sq, max_per from public.matches where id = p_match;
  for g in
    select r.user_id,
      coalesce((select round(avg(voto)::numeric,2)
                from public.votes where votato_id=r.user_id), 5.5) as rating
    from public.match_registrations r
    where r.match_id = p_match and not r.in_attesa
    order by rating desc, r.user_id
  loop
    best := 'A'; best_cnt := cnt_a;
    best_avg := case when cnt_a=0 then 0 else sum_a/cnt_a end;
    if n_sq >= 2 and (cnt_b < best_cnt or
       (cnt_b=best_cnt and (case when cnt_b=0 then 0 else sum_b/cnt_b end) < best_avg)) then
      best := 'B'; best_cnt := cnt_b;
      best_avg := case when cnt_b=0 then 0 else sum_b/cnt_b end;
    end if;
    if n_sq >= 3 and (cnt_c < best_cnt or
       (cnt_c=best_cnt and (case when cnt_c=0 then 0 else sum_c/cnt_c end) < best_avg)) then
      best := 'C'; best_cnt := cnt_c;
      best_avg := case when cnt_c=0 then 0 else sum_c/cnt_c end;
    end if;
    if n_sq >= 4 and (cnt_d < best_cnt or
       (cnt_d=best_cnt and (case when cnt_d=0 then 0 else sum_d/cnt_d end) < best_avg)) then
      best := 'D'; best_cnt := cnt_d;
      best_avg := case when cnt_d=0 then 0 else sum_d/cnt_d end;
    end if;
    if best_cnt >= max_per then
      best := case when cnt_a<=cnt_b and cnt_a<=cnt_c and cnt_a<=cnt_d then 'A'
                   when cnt_b<=cnt_c and cnt_b<=cnt_d then 'B'
                   when cnt_c<=cnt_d then 'C' else 'D' end;
    end if;
    insert into public.squadre (match_id, giocatore_id, squadra)
      values (p_match, g.user_id, best);
    insert into public.match_ruoli (match_id, giocatore_id, squadra, ruolo_partita)
      values (p_match, g.user_id, best, 'giocatore');
    if best='A' then cnt_a:=cnt_a+1; sum_a:=sum_a+g.rating;
    elsif best='B' then cnt_b:=cnt_b+1; sum_b:=sum_b+g.rating;
    elsif best='C' then cnt_c:=cnt_c+1; sum_c:=sum_c+g.rating;
    else cnt_d:=cnt_d+1; sum_d:=sum_d+g.rating; end if;
    tot := tot + 1;
  end loop;
  return tot;
end; $$;
grant execute on function public.genera_squadre_bilate(uuid) to authenticated;

create or replace function public.imposta_squadra(p_match uuid, p_user uuid, p_squadra text)
  returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if p_squadra is null or length(trim(p_squadra))=0 then
    delete from public.squadre where match_id=p_match and giocatore_id=p_user;
    delete from public.match_ruoli where match_id=p_match and giocatore_id=p_user
      and ruolo_partita in ('giocatore','jolly');
    return;
  end if;
  if upper(trim(p_squadra)) not in ('A','B','C','D') then
    raise exception 'Squadra non valida (A/B/C/D)';
  end if;
  insert into public.squadre(match_id, giocatore_id, squadra)
    values(p_match, p_user, upper(trim(p_squadra)))
    on conflict (match_id, giocatore_id) do update set squadra = upper(trim(p_squadra));
  insert into public.match_ruoli(match_id, giocatore_id, squadra, ruolo_partita)
    values(p_match, p_user, upper(trim(p_squadra)), 'giocatore')
    on conflict (match_id, giocatore_id, ruolo_partita)
    do update set squadra = upper(trim(p_squadra));
end; $$;
grant execute on function public.imposta_squadra(uuid, uuid, text) to authenticated;

create or replace function public.imposta_allenatore(p_match uuid, p_user uuid, p_squadra text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.match_ruoli
    where match_id=p_match and giocatore_id=p_user and ruolo_partita='allenatore';
  if p_squadra is null or length(trim(p_squadra))=0 then return; end if;
  if upper(trim(p_squadra)) not in ('A','B','C','D') then
    raise exception 'Squadra non valida (A/B/C/D)';
  end if;
  insert into public.match_ruoli(match_id, giocatore_id, squadra, ruolo_partita)
    values(p_match, p_user, upper(trim(p_squadra)), 'allenatore');
end; $$;
grant execute on function public.imposta_allenatore(uuid, uuid, text) to authenticated;

create or replace function public.segna_jolly(p_match uuid, p_user uuid, p_squadre text[])
  returns void language plpgsql security definer set search_path = public as $$
declare sq text;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.squadre where match_id=p_match and giocatore_id=p_user;
  delete from public.match_ruoli where match_id=p_match and giocatore_id=p_user
    and ruolo_partita in ('giocatore','jolly');
  if p_squadre is null then return; end if;
  foreach sq in array p_squadre loop
    if upper(trim(sq)) in ('A','B','C','D') then
      insert into public.squadre(match_id, giocatore_id, squadra)
        values(p_match, p_user, upper(trim(sq)));
      insert into public.match_ruoli(match_id, giocatore_id, squadra, ruolo_partita)
        values(p_match, p_user, upper(trim(sq)), 'jolly');
    end if;
  end loop;
end; $$;
grant execute on function public.segna_jolly(uuid, uuid, text[]) to authenticated;

create or replace function public.salva_voto(
  p_match uuid, p_votato uuid, p_voto numeric, p_commento text default '')
returns void language plpgsql security definer set search_path = public as $$
declare m record; mia_sq text; sq_votato text; ruolo_votato text;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if p_voto < 1 or p_voto > 10 then raise exception 'Voto non valido (1-10)'; end if;
  select * into m from public.matches where id = p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if m.stato <> 'giocata' then raise exception 'Risultato non ancora inserito'; end if;
  if not m.votazione_aperta then raise exception 'La votazione non è aperta'; end if;
  if m.votazione_scadenza is not null and m.votazione_scadenza < now() then
    raise exception 'Votazione scaduta';
  end if;
  select squadra into mia_sq from public.squadre
    where match_id=p_match and giocatore_id=auth.uid();
  if mia_sq is null then raise exception 'Devi essere schierato per votare'; end if;
  select squadra, ruolo_partita into sq_votato, ruolo_votato
    from public.match_ruoli where match_id=p_match and giocatore_id=p_votato limit 1;
  if sq_votato is null then
    select squadra into sq_votato from public.squadre
      where match_id=p_match and giocatore_id=p_votato;
    if sq_votato is null then raise exception 'Giocatore non presente in questa partita'; end if;
    ruolo_votato := 'giocatore';
  end if;
  if p_votato = auth.uid() then raise exception 'Non puoi votare te stesso'; end if;
  if upper(mia_sq) = upper(sq_votato) and ruolo_votato = 'giocatore' then
    raise exception 'Puoi votare solo giocatori delle altre squadre (o allenatori/jolly)';
  end if;
  insert into public.votes(match_id, votante_id, votato_id, voto, commento, updated_at)
    values(p_match, auth.uid(), p_votato, round(p_voto*2)/2, coalesce(p_commento,''), now())
  on conflict (match_id, votante_id, votato_id)
  do update set voto=excluded.voto, commento=excluded.commento, updated_at=now();
end; $$;
grant execute on function public.salva_voto(uuid, uuid, numeric, text) to authenticated;

create or replace function public.salva_mvp(p_match uuid, p_candidato uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if not exists (select 1 from public.profiles where id=auth.uid() and is_tuttofare) then
    raise exception 'Solo i profili "tuttofare" possono votare l''MVP';
  end if;
  select * into m from public.matches where id=p_match;
  if m is null then raise exception 'Partita non trovata'; end if;
  if m.stato <> 'giocata' then raise exception 'Risultato non ancora inserito'; end if;
  if not exists (select 1 from public.mvp_candidates where match_id=p_match and giocatore_id=p_candidato) then
    raise exception 'Candidato non valido per questa partita';
  end if;
  insert into public.mvp_votes(match_id, votante_id, candidato_id)
    values(p_match, auth.uid(), p_candidato)
  on conflict (match_id, votante_id) do update
    set candidato_id = excluded.candidato_id, created_at = now();
end; $$;
grant execute on function public.salva_mvp(uuid, uuid) to authenticated;

create or replace function public.set_tuttofare(p_user uuid, p_val boolean) returns void
  language sql security definer set search_path = public as $$
  update public.profiles set is_tuttofare = p_val where id = p_user;
$$;
grant execute on function public.set_tuttofare(uuid, boolean) to authenticated;

-- ============================================================================
-- 6) Bucket foto + policy (vedi storage-policies.sql per la versione solo
--    policy, utile per re-importare dopo modifiche).
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('foto-profili', 'foto-profili', true)
  on conflict (id) do nothing;

drop policy if exists foto_upload on storage.objects;
create policy foto_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'foto-profili'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin_storage()
    )
  );

drop policy if exists foto_update on storage.objects;
create policy foto_update on storage.objects for update to authenticated
  using (
    bucket_id = 'foto-profili'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin_storage()
    )
  );

drop policy if exists foto_delete on storage.objects;
create policy foto_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'foto-profili'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin_storage()
    )
  );
-- SELECT pubblico tramite bucket public=true (nessuna policy di select necessaria).

-- Verifica finale
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'storage' and policyname like 'foto_%';
