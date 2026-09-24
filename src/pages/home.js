// ============================================================================
// HOME — prossima partita in evidenza, votazioni da completare, classifica
// ============================================================================
import { state, profiloPerId } from '../state.js';
import {
  listaPartite, iscriviti, cancellati, iscrittiPartita, mieIscrizioni,
  squadrePartita, mieiVoti, statisticheGlobali, getImpostazioni,
} from '../api.js';
import { el, fmtData, toast, avatar, nomeProfilo, oggiISO, vuoto, spinner } from '../ui.js';

const MEDAGLIE = ['🥇', '🥈', '🥉'];

export async function renderizzaHome(app) {
  app.append(spinner());
  const userId = state.sessione.user.id;
  const [partite, mie, imp, stats] = await Promise.all([
    listaPartite(), mieIscrizioni(userId), getImpostazioni(), statisticheGlobali(),
  ]);
  const oggi = oggiISO();
  const prossima = partite
    .filter(p => p.stato === 'programmata' && p.data >= oggi)
    .sort((a, b) => a.data.localeCompare(b.data))[0] ||
    partite.find(p => p.stato === 'programmata');
  app.innerHTML = '';

  // ---------------- Partita in evidenza ----------------
  if (prossima) {
    const iscritti = await iscrittiPartita(prossima.id);
    const num = iscritti.filter(g => !g.in_attesa).length;
    const inAttesa = iscritti.length - num;
    const mioStato = mie[prossima.id];

    const azione = el('button', { class: 'btn btn-blocco ' + (mioStato ? 'btn-ghost' : 'btn-arancio') },
      [mioStato === 'iscritto' ? '✓ Iscritto — tocca per annullare'
       : mioStato === 'attesa' ? '⏳ In lista d\'attesa — tocca per uscire'
       : '⚽ Mi iscrivo']);
    azione.addEventListener('click', async () => {
      azione.disabled = true;
      try {
        if (mioStato) { await cancellati(prossima.id); toast('Iscrizione annullata.'); }
        else {
          const r = await iscriviti(prossima.id);
          toast(r === 'lista_attesa' ? 'Posti esauriti: sei in lista d\'attesa.' : 'Iscrizione confermata! 💪');
        }
        renderizzaHome(app); // ricarica la home aggiornata
        return;
      } catch (e) { toast(e.message, 'errore'); }
      azione.disabled = false;
    });

    app.append(el('div', { class: 'hero' }, [
      el('div', { class: 'hero-etichetta' }, ['⏭ Prossima partita']),
      el('div', { class: 'hero-data' }, [fmtData(prossima.data) + ' · ' + prossima.ora.slice(0, 5)]),
      el('div', { class: 'hero-luogo' }, ['📍 ' + (prossima.luogo || 'Luogo da definire')]),
      el('div', { class: 'hero-iscritti' },
        [`👥 ${num}/${prossima.max_giocatori} iscritti` + (inAttesa ? ` · ${inAttesa} in attesa` : '')]),
      azione,
      el('a', { class: 'auth-link', style: 'color:#fff;opacity:.85;margin-top:8px', href: `#/partita/${prossima.id}` },
        ['Dettagli partita →']),
    ]));
  } else {
    app.append(el('div', { class: 'card' }, [el('div', { class: 'vuoto' }, ['Nessuna partita programmata. Chiedi all\'admin! 📅'])]));
  }

  // ---------------- Votazioni da completare ----------------
  const aperte = partite.filter(p => p.stato === 'giocata' && p.votazione_aperta);
  for (const p of aperte) {
    const sq = await squadrePartita(p.id);
    const mia = sq.find(g => g.id === userId);
    if (!mia) continue;
    const mieiV = await mieiVoti(p.id, userId);
    const mancanti = sq.filter(g => g.squadra !== mia.squadra && !mieiV[g.id]).length;
    if (mancanti > 0) {
      app.append(el('div', { class: 'card', style: 'border-left:5px solid var(--arancio)' }, [
        el('div', { class: 'card-titolo' }, ['⭐ Votazione aperta']),
        el('div', { class: 'riga-sub' }, [
          `${fmtData(p.data)}: devi votare ${mancanti} giocatore${mancanti > 1 ? 'i' : ''} dell'avversaria!`]),
        el('a', { class: 'btn btn-arancio btn-blocco', href: `#/voti/${p.id}`, style: 'margin-top:10px' }, ['Vota ora']),
      ]));
    }
  }

  // ---------------- Classifica rapida ----------------
  const idonei = stats.filter(s => s.presenze >= imp.min_partite_classifica);
  const topVoti = idonei.filter(s => s.num_voti > 0).slice(0, 3);
  const topGol = [...stats].filter(s => s.gol > 0)
    .sort((a, b) => b.gol - a.gol || (b.gol / Math.max(b.presenze, 1)) - (a.gol / Math.max(a.presenze, 1))).slice(0, 3);

  const rigaClassifica = (s, i, valore) => el('div', { class: 'riga' }, [
    el('span', { class: 'pos-medaglia' }, [MEDAGLIE[i] || `${i + 1}.`]),
    avatar(profiloPerId(s.giocatore_id) || s, 36),
    el('div', { class: 'riga-testo' }, [
      el('a', { class: 'riga-titolo', style: 'text-decoration:none;color:inherit',
               href: `#/profilo/${s.giocatore_id}` }, [nomeProfilo(s)]),
      el('div', { class: 'riga-sub' }, [`${s.presenze} presenze`]),
    ]),
    el('span', { class: 'voto-badge' + (valore >= 7 ? ' voto-alto' : '') }, [valore]),
  ]);

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['⭐ Top giocatori']),
    topVoti.length ? topVoti.map((s, i) => rigaClassifica(s, i, Number(s.media_voti)))
                   : el('div', { class: 'vuoto' }, [`Nessuna classifica (min. ${imp.min_partite_classifica} partite)`]),
  ]));
  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['⚽ Capocannonieri']),
    topGol.length ? topGol.map((s, i) => rigaClassifica(s, i, `${s.gol} ⚽`))
                  : el('div', { class: 'vuoto' }, ['Nessun gol segnato… per ora!']),
  ]));

  // ---------------- Prossime partite ----------------
  const prossime = partite.filter(p => p.stato === 'programmata' && p.data >= oggi).slice(0, 3);
  if (prossime.length) {
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['📅 Prossime partite']),
      prossime.map(p => el('div', { class: 'riga' }, [
        el('div', { class: 'riga-testo' }, [
          el('div', { class: 'riga-titolo' }, [fmtData(p.data) + ' · ' + p.ora.slice(0, 5)]),
          el('div', { class: 'riga-sub' }, [p.luogo || '—']),
        ]),
        mioStatoBadge(mie[p.id]),
        el('a', { class: 'btn btn-ghost btn-mini', href: `#/partita/${p.id}` }, ['Dettagli']),
      ])),
      el('a', { class: 'btn btn-ghost btn-blocco', href: '#/calendario', style: 'margin-top:10px' }, ['Vedi tutto il calendario']),
    ]));
  }
}

function mioStatoBadge(stato) {
  if (stato === 'iscritto') return el('span', { class: 'badge' }, ['✓ iscritto']);
  if (stato === 'attesa') return el('span', { class: 'badge badge-arancio' }, ['⏳ attesa']);
  return el('span', { class: 'badge badge-grigio' }, ['non iscritto']);
}
