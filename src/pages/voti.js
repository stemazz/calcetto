// ============================================================================
// VOTAZIONI — elenco votazioni aperte, scheda di voto (player 1-10 + allenatore),
// e scheda MVP (scelta singola, solo profili "tuttofare").
// Regole:
//   • voto ai giocatori: solo altre squadre (e jolly)
//   • voto all'allenatore: chiunque (partecipante)
//   • jolly visibile come "in più squadre"
// ============================================================================
import { state } from '../state.js';
import {
  singolaPartita, squadrePartita, mieiVoti, salvaVoto,
  salvaMVP, mioMVPScelto, candidatiMVP, gestisciVotazione,
} from '../api.js';
import {
  el, fmtData, fmtScadenza, avatar, nomeProfilo, toast, spinner, vuoto, selectVoto,
} from '../ui.js';

export async function renderizzaVoti(app, matchId) {
  if (matchId) { await schedaVotazione(app, matchId); return; }
  app.append(spinner());
  const { sb } = await import('../supabase.js');
  const { data: partite, error } = await sb.from('matches')
    .select('*').eq('stato', 'giocata').order('data', { ascending: false });
  if (error) { app.innerHTML = ''; app.append(vuoto('Errore di caricamento')); return; }

  app.innerHTML = '';
  app.append(el('h2', { style: 'margin:4px 0 12px;font-size:20px' }, ['⭐ Votazioni']));

  const aperte = partite.filter(p => p.votazione_aperta);
  const chiuse = partite.filter(p => !p.votazione_aperta).slice(0, 6);

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['🔓 Aperte ora']),
    aperte.length ? aperte.map(p => el('div', { class: 'riga' }, [
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [fmtData(p.data) + ' · ' + p.ora.slice(0, 5)]),
        el('div', { class: 'riga-sub countdown' }, [`Scade: ${fmtScadenza(p.votazione_scadenza)}`]),
      ]),
      el('a', { class: 'btn btn-arancio btn-mini', href: `#/voti/${p.id}` }, ['Vota']),
    ])) : vuoto('Nessuna votazione aperta. Si apre quando l\'admin inserisce il risultato.'),
  ]));

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['✅ Chiuse / recenti']),
    chiuse.length ? chiuse.map(p => el('div', { class: 'riga' }, [
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [fmtData(p.data)]),
        el('div', { class: 'riga-sub' }, [`${p.gol_squadra_a}–${p.gol_squadra_b}`]),
      ]),
      el('a', { class: 'btn btn-ghost btn-mini', href: `#/partita/${p.id}` }, ['Dettagli']),
    ])) : vuoto('Ancora nessuna partita giocata.'),
  ]));
}

async function schedaVotazione(app, matchId) {
  app.append(spinner());
  const userId = state.sessione.user.id;
  const profilo = state.profilo || {};
  const [p, squadre, mieiV, candidati, mvpMio] = await Promise.all([
    singolaPartita(matchId), squadrePartita(matchId),
    mieiVoti(matchId, userId), candidatiMVP(matchId),
    mioMVPScelto(matchId, userId).catch(() => null),
  ]);
  app.innerHTML = '';
  app.append(el('a', { href: '#/voti', class: 'riga-sub', style: 'display:block;margin-bottom:8px;text-decoration:none' }, ['← Tutte le votazioni']));

  const mieSquadre = squadre.filter(g => g.id === userId).map(s => s.squadra);
  if (!mieSquadre.length) {
    app.append(el('div', { class: 'card vuoto' },
      ['🚫 Non hai partecipato a questa partita (non sei schierato): non puoi votare.']));
    return;
  }

  const scaduta = p.votazione_scadenza && new Date(p.votazione_scadenza) < new Date();
  const aperta = p.votazione_aperta && !scaduta;

  app.append(el('div', { class: 'hero' }, [
    el('div', { class: 'hero-etichetta' }, ['⭐ Votazione']),
    el('div', { class: 'hero-data', style: 'font-size:20px' }, [fmtData(p.data)]),
    el('div', { class: 'hero-luogo' },
      [`Risultato: A ${p.gol_squadra_a ?? '?'} – ${p.gol_squadra_b ?? '?'} B` +
       (p.num_squadre > 2 ? ` · ${p.num_squadre} squadre` : '')]),
    el('div', { style: 'display:flex;gap:8px' }, [
      aperta ? el('span', { class: 'badge', style: 'background:#fff;color:var(--verde-scuro)' }, ['APERTA'])
             : el('span', { class: 'badge', style: 'background:rgba(255,255,255,.25);color:#fff' }, ['CHIUSA']),
      p.votazione_scadenza ? el('span', { class: 'countdown' }, [aperta ? 'Scade: ' + fmtScadenza(p.votazione_scadenza) : '']) : null,
    ]),
  ]));

  if (!aperta) {
    app.append(el('div', { class: 'card vuoto' }, ['🔒 La votazione è chiusa. Puoi vedere medie e commenti nel dettaglio partita.']));
  }

  // Lista votabili: giocatori di altre squadre + allenatori (chiunque)
  const votabiliGiocatori = squadre.filter(g =>
    g.id !== userId && g.ruolo !== 'allenatore' && !mieSquadre.includes(g.squadra));
  const allenatori = squadre.filter(g => g.ruolo === 'allenatore' && g.id !== userId);

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, [`⚽ Giocatori delle altre squadre (${votabiliGiocatori.length})`]),
    votabiliGiocatori.length ? votabiliGiocatori.map(g => rigaVoto(g)) : vuoto('Nessun avversario schierato'),
  ]));

  if (allenatori.length) {
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, [`👔 Allenatori (votabili da tutti, ${allenatori.length})`]),
      allenatori.map(g => rigaVoto(g, /*allenatore*/true)),
    ]));
  }

  function rigaVoto(g, allenatore = false) {
    const mio = mieiV[g.id];
    const input = selectVoto(mio?.voto ?? '');
    const commento = el('input', { class: 'input',
      placeholder: 'Commento (facoltativo)', value: mio?.commento || '',
      style: 'min-height:40px;font-size:14px' });
    const btn = el('button', { class: 'btn btn-primary btn-mini' },
      [mio ? '✓ Salva' : 'Vota']);
    btn.addEventListener('click', async () => {
      if (!aperta) { toast('La votazione è chiusa.', 'errore'); return; }
      if (!input.value) { toast('Scegli un voto', 'errore'); return; }
      btn.disabled = true;
      try {
        await salvaVoto(matchId, g.id, input.value, commento.value.trim());
        toast(`Voto ${input.value} a ${nomeProfilo(g)} salvato!`);
        btn.textContent = '✓ Salva';
        mieiV[g.id] = { voto: input.value, commento: commento.value.trim() };
      } catch (e) { toast(e.message, 'errore'); }
      btn.disabled = false;
    });
    return el('div', { class: 'voto-riga' }, [
      avatar(g, 38),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo', style: 'font-size:14px' }, [
          nomeProfilo(g),
          allenatore ? el('span', { class: 'badge', style: 'margin-left:6px' }, ['👔 Allenatore']) : null,
          g.ruolo === 'jolly' ? el('span', { class: 'badge badge-arancio', style: 'margin-left:6px' }, ['🎭 Jolly']) : null,
        ]),
        commento,
      ]),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px;align-items:stretch' }, [input, btn]),
    ]);
  }

  // Sezione MVP (solo profili tuttofare)
  if (profilo.is_tuttofare && candidati.length) {
    app.append(el('div', { class: 'card', style: 'border-left:5px solid var(--verde)' }, [
      el('div', { class: 'card-titolo' }, ['🌟 MVP della partita (scelta singola)']),
      el('div', { class: 'riga-sub', style: 'margin-bottom:8px' },
        [`Hai già scelto: ${mvpMio ? nomeProfilo(candidati.find(c => c.id === mvpMio) || { nome: '—' }) : 'nessuno'}`]),
      el('div', { class: 'elenco-checkbox' },
        candidati.map(c => el('span', {
          class: 'chip' + (mvpMio === c.id ? ' sel' : ''),
          style: 'cursor:pointer',
          onclick: async () => {
            try {
              await salvaMVP(matchId, c.id);
              toast(`MVP: ${nomeProfilo(c)}`);
              schedaVotazione(app, matchId);
              return;
            } catch (e) { toast(e.message, 'errore'); }
          }
        }, [nomeProfilo(c)]))),
    ]));
  } else if (candidati.length && !profilo.is_tuttofare) {
    app.append(el('div', { class: 'card', style: 'border-left:5px solid var(--verde)' }, [
      el('div', { class: 'card-titolo' }, ['🌟 MVP']),
      el('div', { class: 'riga-sub' },
        [`I candidati sono: ${candidati.map(c => nomeProfilo(c)).join(', ')}. Solo i profili "tuttofare" possono scegliere l'MVP.`]),
    ]));
  }

  // Se l'admin è loggato, pulsante rapido per chiudere ora
  if (state.profilo?.is_admin && aperta) {
    app.append(el('div', { class: 'card' }, [
      el('button', { class: 'btn btn-pericolo btn-blocco', onclick: async () => {
        if (!confirm('Chiudere la votazione di questa partita ADESSO?')) return;
        try {
          await gestisciVotazione(matchId, 'chiudi');
          toast('Votazione chiusa.');
          renderizzaVoti(app, matchId);
          return;
        } catch (e) { toast(e.message, 'errore'); }
      } }, ['🔒 Chiudi votazione ora']),
    ]));
  }
}
