-- ============================================================================
-- TEST AUTOMATICI della logica (eseguire DOPO stubs + schema + seed)
-- Eseguiti con il ruolo "authenticated" per testare DAVVERO le policy RLS.
-- ============================================================================
create or replace function public.test_as(u uuid) returns void
language sql as $$ select set_config('app.current_user_id', coalesce(u::text, ''), false) $$;

-- Utente admin di prova (come farà il vero admin dopo la registrazione)
do $$ begin
  if not exists (select 1 from auth.users where email = 'admin.test@example.com') then
    insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
    values (gen_random_uuid(), 'admin.test@example.com', crypt('admintest', gen_salt('bf')),
            jsonb_build_object('nome', 'Admin', 'cognome', 'Test'));
  end if;
end $$;
update public.profiles set is_admin = true where email = 'admin.test@example.com';

begin;
select set_config('role', 'authenticated', true); -- da qui in valgono le policy RLS

do $$
declare
  u1 uuid; u2 uuid; u6 uuid; u7 uuid; u8 uuid; u10 uuid; u11 uuid; admin uuid;
  m_fut uuid; m_aperta uuid; m_chiusa uuid; r text; n int;
begin
  select id into u1  from auth.users where email = 'demo.calcetto1@example.com';
  select id into u2  from auth.users where email = 'demo.calcetto2@example.com';
  select id into u6  from auth.users where email = 'demo.calcetto6@example.com';
  select id into u7  from auth.users where email = 'demo.calcetto7@example.com';
  select id into u8  from auth.users where email = 'demo.calcetto8@example.com';
  select id into u10 from auth.users where email = 'demo.calcetto10@example.com';
  select id into u11 from auth.users where email = 'demo.calcetto11@example.com';
  select id into admin from auth.users where email = 'admin.test@example.com';
  perform public.test_as(admin); -- conteggi globali: li vede solo l'admin

  -- T1: seed completo -------------------------------------------------------
  if (select count(*) from public.profiles where is_demo) <> 12
    then raise exception 'T1 FALLITO: profili demo <> 12'; end if;
  if (select count(*) from public.matches where is_demo) <> 6
    then raise exception 'T1 FALLITO: partite demo <> 6'; end if;
  if (select count(*) from public.votes) < 100
    then raise exception 'T1 FALLITO: voti demo insufficienti'; end if;
  raise notice 'T1 OK: seed (12 profili, 6 partite, % voti)', (select count(*) from public.votes);

  -- T2: anonimato — nessuna vista pubblica espone chi ha votato -------------
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'vista_voti_pubblici'
               and column_name = 'votante_id')
    then raise exception 'T2 FALLITO: vista pubblica espone votante_id'; end if;
  raise notice 'T2 OK: viste pubbliche anonime';

  -- T3: iscrizioni, doppia iscrizione bloccata -------------------------------
  select id into m_fut from public.matches where is_demo and stato = 'programmata' order by data limit 1;
  perform public.test_as(u7);
  r := public.iscriviti_partita(m_fut);
  if r <> 'iscritto' then raise exception 'T3 FALLITO: iscrizione = %', r; end if;
  perform public.test_as(admin);
  perform public.iscrivi_manuale(m_fut, u10);
  perform public.iscrivi_manuale(m_fut, u11);
  perform public.iscrivi_manuale(m_fut, admin); -- ora 6+4 = 10 = piena
  n := (select count(*) from public.match_registrations where match_id = m_fut and not in_attesa);
  if n <> 10 then raise exception 'T3 FALLITO: iscritti = % (attesi 10)', n; end if;
  perform public.test_as(u7);
  begin
    perform public.iscriviti_partita(m_fut);
    raise exception 'T3 FALLITO: doppia iscrizione consentita';
  exception when others then null; end;
  raise notice 'T3 OK: iscrizioni e doppia iscrizione bloccata';

  -- T3b: lista d'attesa + promozione automatica ------------------------------
  perform public.test_as(u8); -- u8 non è iscritto
  r := public.iscriviti_partita(m_fut);
  if r <> 'lista_attesa' then raise exception 'T3b FALLITO: atteso lista_attesa, ottenuto %', r; end if;
  perform public.test_as(u11); -- un iscritto si cancella
  perform public.cancellati_partita(m_fut);
  if exists (select 1 from public.match_registrations
             where match_id = m_fut and user_id = u8 and in_attesa)
    then raise exception 'T3b FALLITO: u8 non promosso dalla lista'; end if;
  n := (select count(*) from public.match_registrations where match_id = m_fut and not in_attesa);
  if n <> 10 then raise exception 'T3b FALLITO: post-iscritti = %', n; end if;
  raise notice 'T3b OK: lista d''attesa e promozione automatica';

  -- T4: regole di voto -------------------------------------------------------
  select id into m_aperta from public.matches where is_demo and votazione_aperta order by data desc limit 1;
  select id into m_chiusa from public.matches where is_demo and not votazione_aperta and stato = 'giocata' limit 1;
  perform public.test_as(u1); -- squadra A (1-5)
  -- voto valido con arrotondamento ai mezzi punti: 7.3 → 7.5
  perform public.salva_voto(m_aperta, u6, 7.3, 'Forza!');
  if (select voto from public.votes where match_id = m_aperta and votante_id = u1 and votato_id = u6) <> 7.5
    then raise exception 'T4 FALLITO: arrotondamento mezzi voti'; end if;
  -- compagno di squadra → errore
  begin
    perform public.salva_voto(m_aperta, u2, 8);
    raise exception 'T4 FALLITO: voto al compagno consentito';
  exception when others then null; end;
  -- voto a se stesso → errore
  begin
    perform public.salva_voto(m_aperta, u1, 8);
    raise exception 'T4 FALLITO: voto a se stesso consentito';
  exception when others then null; end;
  -- non schierato → errore (u11 non è in squadre di m_aperta)
  perform public.test_as(u11);
  begin
    perform public.salva_voto(m_aperta, u1, 8);
    raise exception 'T4 FALLITO: voto da non schierato consentito';
  exception when others then null; end;
  -- partita con votazione chiusa → errore
  perform public.test_as(u1);
  begin
    perform public.salva_voto(m_chiusa, u6, 8);
    raise exception 'T4 FALLITO: voto a votazione chiusa consentito';
  exception when others then null; end;
  -- voto fuori scala → errore
  begin
    perform public.salva_voto(m_aperta, u6, 11);
    raise exception 'T4 FALLITO: voto 11 consentito';
  exception when others then null; end;
  -- modifica del proprio voto mentre aperta → ok
  perform public.salva_voto(m_aperta, u6, 5, '');
  if (select voto from public.votes where match_id = m_aperta and votante_id = u1 and votato_id = u6) <> 5.0
    then raise exception 'T4 FALLITO: modifica voto'; end if;
  raise notice 'T4 OK: regole voto (avversari, mezzi voti, modifica, chiusure)';

  -- T5: RLS sui voti — ognuno vede/scrive solo i propri ----------------------
  perform public.test_as(u1);
  n := (select count(*) from public.votes where votante_id <> u1);
  if n > 0 then raise exception 'T5 FALLITO: u1 vede % voti altrui', n; end if;
  perform public.test_as(admin);
  if (select count(*) from public.votes) < 100
    then raise exception 'T5 FALLITO: admin non vede tutti i voti'; end if;
  -- inserimento diretto di un voto non valido → bloccato dalla policy RLS
  perform public.test_as(u1);
  begin
    insert into public.votes (match_id, votante_id, votato_id, voto) values (m_aperta, u1, u2, 9);
    raise exception 'T5 FALLITO: policy non blocca voto al compagno';
  exception when others then null; end;
  raise notice 'T5 OK: RLS voti (anonimato, admin, validazione)';

  -- T6: RLS profili — niente auto-promozione admin ---------------------------
  perform public.test_as(u1);
  begin
    update public.profiles set is_admin = true where id = u1;
    if (select is_admin from public.profiles where id = u1) then
      raise exception 'T6 FALLITO: auto-promozione admin riuscita';
    end if;
  exception when others then null; end;
  perform public.test_as(u1);
  update public.profiles set soprannome = 'Capitan' where id = u1; -- propria modifica OK
  perform public.test_as(admin);
  update public.profiles set nome = 'Marco Mod' where id = u1;     -- admin modifica OK
  raise notice 'T6 OK: RLS profili';

  -- T7: risultato → votazione aperta con scadenza ~48h -----------------------
  perform public.test_as(admin);
  perform public.imposta_risultato(m_chiusa, 3, 1, null);
  if not (select votazione_aperta from public.matches where id = m_chiusa)
    then raise exception 'T7 FALLITO: votazione non aperta'; end if;
  n := (select abs(extract(epoch from (votazione_scadenza - now())) / 3600 - 48)::int
        from public.matches where id = m_chiusa);
  if n > 1 then raise exception 'T7 FALLITO: scadenza a % ore', n; end if;
  raise notice 'T7 OK: imposta_risultato apre la votazione (~48h)';

  -- T8: genera squadre bilanciate (5 vs 5) -----------------------------------
  perform public.genera_squadre_bilate(m_chiusa);
  if (select count(*) from public.squadre where match_id = m_chiusa and squadra = 'A') <> 5
     or (select count(*) from public.squadre where match_id = m_chiusa and squadra = 'B') <> 5
    then raise exception 'T8 FALLITO: squadre non bilanciate in numero'; end if;
  raise notice 'T8 OK: squadre bilanciate 5 vs 5';

  -- T9: apri / chiudi / riapri votazione -------------------------------------
  perform public.gestisci_votazione(m_chiusa, 'chiudi');
  if (select votazione_aperta from public.matches where id = m_chiusa)
    then raise exception 'T9 FALLITO: chiusura'; end if;
  perform public.gestisci_votazione(m_chiusa, 'riapri');
  if not (select votazione_aperta from public.matches where id = m_chiusa)
    then raise exception 'T9 FALLITO: riapertura'; end if;
  raise notice 'T9 OK: gestione votazione admin';

  -- T10: chiusura automatica delle votazioni scadute --------------------------
  update public.matches set votazione_scadenza = now() - interval '1 hour' where id = m_chiusa;
  perform public.aggiorna_stato_votazioni();
  if (select votazione_aperta from public.matches where id = m_chiusa)
    then raise exception 'T10 FALLITO: scadenza non applicata'; end if;
  raise notice 'T10 OK: chiusura automatica votazioni scadute';

  -- T11: eliminazione utente (solo admin, con cascade) ------------------------
  perform public.test_as(admin);
  perform public.elimina_utente(u11);
  if exists (select 1 from public.profiles where id = u11)
    then raise exception 'T11 FALLITO: profilo non eliminato'; end if;
  perform public.test_as(u1);
  begin
    perform public.elimina_utente(u10);
    raise exception 'T11 FALLITO: non-admin ha eliminato un utente';
  exception when others then null; end;
  raise notice 'T11 OK: eliminazione utente (solo admin)';

  -- T12: statistiche coerenti -------------------------------------------------
  n := (select count(*) from public.vista_statistiche_giocatore where presenze > 0);
  if n < 10 then raise exception 'T12 FALLITO: statistiche insufficienti (%)', n; end if;
  if exists (select 1 from public.vista_mvp_partita where media_voto is null)
    then raise exception 'T12 FALLITO: MVP con media nulla'; end if;
  raise notice 'T12 OK: viste statistiche (% giocatori con presenze)', n;

  raise notice '=== TUTTI I TEST SUPERATI ===';
end $$;

commit;
