// ============================================================================
// VOTAZIONI — elenco votazioni aperte + scheda di voto di una partita.
// Regole: vota solo la squadra avversaria, mezzi voti, modificabile finché aperta.
// ============================================================================
import { state, profiloPerId } from '../state.js';
import {
  singolaPartita, squadrePartita, mieiVoti, salvaVoto, medieVotiPartita,
} from '../api.js';
import {
  el, fmtData, fmtScadenza, avatar, nomeProfilo, toast, spinner, vuoto,
  selectVoto, fmtMese,
} from '../ui.js';

/** Elenco delle votazioni aperte e recenti */
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

/** Scheda di voto di una singola partita */
async function schedaVotazione(app, matchId) {
  app.append(spinner());
  const userId = state.sessione.user.id;
  const [p, squadre, mieiV, medie] = await Promise.all([
    singolaPartita(matchId), squadrePartita(matchId),
    mieiVoti(matchId, userId), medieVotiPartita(matchId),
  ]);
  app.innerHTML = '';
  app.append(el('a', { href: '#/voti', class: 'riga-sub', style: 'display:block;margin-bottom:8px;text-decoration:none' }, ['← Tutte le votazioni']));

  const miaSquadra = squadre.find(g => g.id === userId)?.squadra;

  // Controllo partecipazione: serve essere schierati in campo
  if (!miaSquadra) {
    app.append(el('div', { class: 'card vuoto' },
      ['🚫 Non hai partecipato a questa partita (non eri schierato in campo): non puoi votare.']));
    return;
  }

  const scaduta = p.votazione_scadenza && new Date(p.votazione_scadenza) < new Date();
  const aperta = p.votazione_aperta && !scaduta;

  app.append(el('div', { class: 'hero' }, [
    el('div', { class: 'hero-etichetta' }, ['⭐ Votazione']),
    el('div', { class: 'hero-data', style: 'font-size:20px' }, [fmtData(p.data)]),
    el('div', { class: 'hero-luogo' }, [`Risultato: A ${p.gol_squadra_a} – ${p.gol_squadra_b} B`]),
    el('div', { style: 'display:flex;gap:8px' }, [
      aperta ? el('span', { class: 'badge', style: 'background:#fff;color:var(--verde-scuro)' }, ['APERTA'])
             : el('span', { class: 'badge', style: 'background:rgba(255,255,255,.25);color:#fff' }, ['CHIUSA']),
      p.votazione_scadenza ? el('span', { class: 'countdown' }, [aperta ? 'Scade: ' + fmtScadenza(p.votazione_scadenza) : '']) : null,
    ]),
  ]));

  if (!aperta) {
    app.append(el('div', { class: 'card vuoto' }, ['🔒 La votazione è chiusa. Puoi vedere le medie nel dettaglio partita.']));
  }

  const avversari = squadre.filter(g => g.squadra !== miaSquadra);
  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, [`⚽ Giocatori squadra avversaria (${avversari.length})`]),
    avversari.length ? avversari.map(g => rigaVoto(g)) : vuoto('Nessun avversario schierato'),
  ]));

  function rigaVoto(g) {
    const mio = mieiV[g.id];
    const input = selectVoto(mio?.voto ?? '');
    const commento = el('input', { class: 'input', placeholder: 'Commento (facoltativo)',
      value: mio?.commento || '', style: 'min-height:40px;font-size:14px' });
    const btn = el('button', { class: 'btn btn-primary btn-mini' }, [mio ? '✓ Salva' : 'Vota']);
    btn.addEventListener('click', async () => {
      if (!input.value) { toast('Scegli un voto', 'errore'); return; }
      btn.disabled = true;
      try {
        await salvaVoto(matchId, g.id, input.value, commento.value.trim());
        toast(`Voto ${input.value} a ${nomeProfilo(g)} salvato!`);
        btn.textContent = '✓ Salva';
      } catch (e) { toast(e.message, 'errore'); }
      btn.disabled = false;
    });
    return el('div', { class: 'voto-riga' }, [
      avatar(g, 38),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo', style: 'font-size:14px' }, [nomeProfilo(g)]),
        medie[g.id] ? el('div', { class: 'riga-sub' },
          [`Media ricevuta: ${Number(medie[g.id].media_voto).toFixed(1)} (${medie[g.id].num_voti} voti)`]) : null,
        commento,
      ]),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px;align-items:stretch' }, [input, btn]),
    ]);
  }
}
