-- ============================================================================
-- DATI DI ESEMPIO (demo) — da eseguire nell'SQL Editor di Supabase DOPO schema.sql
-- Crea 12 profili fittizi + 8 partite (giocate con voti e future da giocare).
-- Tutto è marcato is_demo: eliminabile in un colpo solo dall'Area Admin.
-- ============================================================================

do $$
declare
  demo_pass text := 'demo1234';
  ids uuid[];
  i int;
  nomi text[] := array['Marco','Luca','Giuseppe','Andrea','Matteo','Alessandro',
                       'Davide','Simone','Federico','Riccardo','Tommaso','Gabriele'];
  cognomi text[] := array['Rossi','Bianchi','Verdi','Conti','Ricci','Marino',
                          'Greco','Gallo','Costa','Fontana','Rizzo','Moretti'];
  soprannomi text[] := array['','Mars','Bepi','Dre','Mat','Ale','Dave','Sim',
                             'Fede','Rick','Tombo','Gabibbo'];
  ruoli text[] := array['portiere','difensore','centrocampista','attaccante',
                        'portiere','difensore','centrocampista','attaccante',
                        'difensore','centrocampista','attaccante','portiere'];
  email_base text := 'demo.calcetto';
begin
  -- 1) Crea gli utenti demo in auth.users (password: demo1234)
  for i in 1..12 loop
    if not exists (select 1 from auth.users where email = email_base || i || '@example.com') then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_user_meta_data, raw_app_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        email_base || i || '@example.com', crypt(demo_pass, gen_salt('bf')),
        now(), now(), now(),
        jsonb_build_object('nome', nomi[i], 'cognome', cognomi[i], 'soprannome', soprannomi[i]),
        '{"provider":"email","providers":["email"]}'::jsonb
      );
    end if;
  end loop;

  -- 2) Marca i profili demo e assegna ruoli/piedi
  select array_agg(id order by (substring(email from '[0-9]+'))::int) into ids
    from auth.users where email like 'demo.calcetto%';
  for i in 1..12 loop
    update public.profiles set
      is_demo = true,
      ruolo_preferito = ruoli[i],
      piede_preferito = case when i % 3 = 0 then 'sinistro' when i % 3 = 1 then 'destro' else 'ambidestro' end
    where id = ids[i];
  end loop;

  -- 3) Partite passate (giocate, con risultato e voti) e future
  -- 4 partite passate + 2 future
  declare
    m uuid;
    passate date[] := array[current_date - 7, current_date - 14, current_date - 21, current_date - 28];
    future date[] := array[current_date + 3, current_date + 10];
    k int;
  begin
    -- ---- PARTITE PASSATE ----
    for k in 1..4 loop
      insert into public.matches (data, ora, luogo, max_giocatori, stato, is_demo)
        values (passate[k], '19:00', 'Centro Sportivo "Il Prato"', 10, 'giocata', true)
        returning id into m;

      -- iscrizioni: 10 giocatori
      for i in 1..10 loop
        insert into public.match_registrations (match_id, user_id, in_attesa)
          values (m, ids[i], false);
      end loop;

      -- squadre bilanciate semplici: 1-5 in A, 6-10 in B
      for i in 1..10 loop
        insert into public.squadre (match_id, giocatore_id, squadra)
          values (m, ids[i], case when i <= 5 then 'A' else 'B' end);
      end loop;

      -- risultato variabile
      update public.matches set
        gol_squadra_a = case k when 1 then 4 when 2 then 2 when 3 then 3 else 5 end,
        gol_squadra_b = case k when 1 then 2 when 2 then 2 when 3 then 3 else 1 end
        where id = m;

      -- marcatori (qualche gol per i più attaccanti)
      insert into public.goals (match_id, giocatore_id, autogol)
        select m, ids[case k when 1 then 4 when 2 then 8 when 3 then 10 else 4 end], false
        from generate_series(1, case k when 1 then 2 when 2 then 1 when 3 then 1 else 3 end);
      insert into public.goals (match_id, giocatore_id, autogol)
        select m, ids[case k when 1 then 6 when 2 then 7 else 7 end], false
        from generate_series(1, case k when 1 then 2 when 2 then 1 when 3 then 2 else 1 end);
      insert into public.goals (match_id, giocatore_id, autogol)
        select m, ids[5], true from generate_series(1, case k when 2 then 1 else 0 end);

      -- votazioni aperte da poco per la più recente, chiuse per le altre
      update public.matches set
        votazione_aperta = (k = 1),
        votazione_scadenza = case when k = 1 then now() + interval '40 hours' else now() - interval '1 hour' end
        where id = m;

      -- voti: ogni giocatore vota 3 avversari (deterministici, tutti diversi)
      for i in 1..10 loop
        if i <= 5 then
          insert into public.votes (match_id, votante_id, votato_id, voto, commento) values
            (m, ids[i], ids[6 + (i % 5)],      5 + ((i + k) % 9) / 2.0, ''),
            (m, ids[i], ids[6 + ((i + 1) % 5)], 5 + ((i * 2 + k) % 9) / 2.0, ''),
            (m, ids[i], ids[6 + ((i + 2) % 5)], 5 + ((i * 3 + k) % 9) / 2.0, 'Bella gara!');
        else
          insert into public.votes (match_id, votante_id, votato_id, voto, commento) values
            (m, ids[i], ids[1 + (i % 5)],      5 + ((i + k) % 9) / 2.0, ''),
            (m, ids[i], ids[1 + ((i + 1) % 5)], 5 + ((i * 3 + k) % 9) / 2.0, ''),
            (m, ids[i], ids[1 + ((i + 2) % 5)], 5 + ((i * 2 + k) % 9) / 2.0, 'Grande partita!');
        end if;
      end loop;
    end loop;

    -- ---- PARTITE FUTURE ----
    for k in 1..2 loop
      insert into public.matches (data, ora, luogo, max_giocatori, stato, is_demo)
        values (future[k], '19:00', 'Centro Sportivo "Il Prato"', 10, 'programmata', true);
      -- iscrizioni di esempio alla prima
      if k = 1 then
        insert into public.match_registrations (match_id, user_id, in_attesa)
          select (select id from public.matches where is_demo and stato='programmata' order by data limit 1), ids[s], false
          from generate_series(1, 6) s;
      end if;
    end loop;
  end;

  raise notice 'Dati demo creati: 12 utenti (password: demo1234) e 6 partite.';
end $$;
