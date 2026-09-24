// ============================================================================
// DETTAGLIO PARTITA — iscritti, squadre, risultato, marcatori, stato votazioni
// ============================================================================
import { state } from '../state.js';
import {
  singolaPartita, iscrittiPartita, squadrePartita, marcatoriPartita,
  medieVotiPartita, mieiVoti,
} from '../api.js';
import { el, fmtData, fmtScadenza, avatar, nomeProfilo, toast, spinner, vuoto } from '../ui.js';

export async function renderizzaDettaglio(app, id) {
  app.append(spinner());
  const userId = state.sessione.user.id;
  const [p, iscritti, squadre, marcatori, medie, mieiV] = await Promise.all([
    singolaPartita(id), iscrittiPartita(id), squadrePartita(id),
    marcatoriPartita(id), medieVotiPartita(id), mieiVoti(id, userId),
  ]);
  app.innerHTML = '';

  const num = iscritti.filter(g => !g.in_attesa).length;
  const inAttesa = iscritti.length - num;
  const ilMioStato = iscritti.find(g => g.id === userId);

  // Intestazione partita
  const statoBadge = { programmata: el('span', { class: 'badge' }, ['Programmata']),
    giocata: el('span', { class: 'badge badge-blu' }, ['Giocata']),
    annullata: el('span', { class: 'badge badge-rosso' }, ['Annullata']) }[p.stato];

  app.append(el('div', { class: 'hero' }, [
    el('div', { class: 'hero-etichetta' }, ['📅 Partita']),
    el('div', { class: 'hero-data' }, [fmtData(p.data) + ' · ' + p.ora.slice(0, 5)]),
    el('div', { class: 'hero-luogo' }, ['📍 ' + (p.luogo || '—')]),
    el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
      statoBadge,
      el('span', { class: 'badge', style: 'background:rgba(255,255,255,.2);color:#fff' },
        [`👥 ${num}/${p.max_giocatori}` + (inAttesa ? ` (+${inAttesa} attesa)` : '')]),
    ]),
  ]));

  // Risultato
  if (p.stato === 'giocata' && p.gol_squadra_a !== null) {
    const righeM = marcatori.map(m => el('div', { class: 'riga' }, [
      avatar(m.profilo, 34),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [nomeProfilo(m.profilo)]),
        m.autogol ? el('div', { class: 'riga-sub' }, [`${m.autogol} autogol`]) : null,
      ]),
      el('span', { class: 'badge badge-arancio' }, [`${m.gol} ⚽`]),
    ]));
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['🏁 Risultato']),
      el('div', { style: 'font-size:30px;font-weight:900;text-align:center;margin-bottom:8px' },
        [`Squadra A ${p.gol_squadra_a} – ${p.gol_squadra_b} Squadra B`]),
      marcatori.length ? righeM : el('div', { class: 'vuoto' }, ['Nessun marcatore registrato']),
    ]));

    // Stato votazione
    const miaSquadra = squadre.find(g => g.id === userId)?.squadra;
    if (p.votazione_aperta) {
      const scaduta = p.votazione_scadenza && new Date(p.votazione_scadenza) < new Date();
      const mancaQualcosa = miaSquadra
        ? squadre.some(g => g.squadra !== miaSquadra && !mieiV[g.id]) : false;
      app.append(el('div', { class: 'card', style: 'border-left:5px solid var(--arancio)' }, [
        el('div', { class: 'card-titolo' }, ['⭐ Votazione aperta']),
        scaduta
          ? el('div', { class: 'riga-sub' }, ['In scadenza: si chiuderà a breve.'])
          : el('div', { class: 'riga-sub' }, [`Scade il ${fmtScadenza(p.votazione_scadenza)}`]),
        mancaQualcosa
          ? el('a', { class: 'btn btn-arancio btn-blocco', href: `#/voti/${p.id}`, style: 'margin-top:10px' }, ['Vota ora'])
          : el('div', { class: 'riga-sub', style: 'margin-top:8px' }, ['✓ Hai già votato tutti. Grazie!']),
      ]));
    }
  }

  // Squadre (se formate)
  if (squadre.length) {
    const colA = squadre.filter(g => g.squadra === 'A');
    const colB = squadre.filter(g => g.squadra === 'B');
    const rigaSq = (g, sq) => el('div', { class: 'riga', style: 'padding:5px 0;border:none' }, [
      avatar(g, 30),
      el('span', { style: 'font-size:13.5px;font-weight:600' }, [nomeProfilo(g)]),
      medie[g.id] ? el('span', { class: 'voto-badge', style: 'min-width:36px;font-size:12px;padding:2px 6px;margin-left:auto' },
        [Number(medie[g.id].media_voto).toFixed(1)]) : null,
    ]);
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['👥 Squadre']),
      el('div', { class: 'squadre-grid' }, [
        el('div', { class: 'squadra-col squadra-a' }, [
          el('div', { class: 'squadra-nome' }, [`SQUADRA A (${colA.length})`]),
          colA.map(g => rigaSq(g, 'A')),
        ]),
        el('div', { class: 'squadra-col squadra-b' }, [
          el('div', { class: 'squadra-nome' }, [`SQUADRA B (${colB.length})`]),
          colB.map(g => rigaSq(g, 'B')),
        ]),
      ]),
    ]));
  }

  // Iscritti
  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, [`👥 Iscritti (${num}/${p.max_giocatori})`]),
    iscritti.length ? iscritti.map((g, i) => el('div', { class: 'riga' }, [
      el('span', { class: 'badge badge-grigio', style: 'min-width:26px;text-align:center' }, [i + 1]),
      avatar(g, 36),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [nomeProfilo(g) + (g.id === userId ? ' (tu)' : '')]),
        el('div', { class: 'riga-sub' }, [g.ruolo_preferito || 'ruolo libero']),
      ]),
      g.in_attesa ? el('span', { class: 'badge badge-arancio' }, ['⏳ in attesa']) : null,
    ])) : el('div', { class: 'vuoto' }, ['Nessun iscritto: sii il primo!']),
  ]));
}
