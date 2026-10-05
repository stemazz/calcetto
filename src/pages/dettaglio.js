// ============================================================================
// DETTAGLIO PARTITA — squadre (N), risultato, marcatori, voti+commenti (anonimi),
// MVP risultato, stato votazioni.
// ============================================================================
import { state } from '../state.js';
import {
  singolaPartita, iscrittiPartita, squadrePartita, marcatoriPartita, risultatiPartita,
  votiConCommentiPartita, medieVotiPartita, mioMVPScelto, risultatoMVP, candidatiMVP,
} from '../api.js';
import { el, fmtData, fmtScadenza, avatar, nomeProfilo, toast, spinner, vuoto, scaricaICS } from '../ui.js';

const COLORI_SQUADRA = {
  A: { bg: '#e9f2fc', fg: '#2273d2', nome: 'Squadra A' },
  B: { bg: '#f3ebfd', fg: '#7a3fd1', nome: 'Squadra B' },
  C: { bg: '#e7f8ec', fg: '#0e7a3d', nome: 'Squadra C' },
  D: { bg: '#fff1e0', fg: '#e05e00', nome: 'Squadra D' },
};

export async function renderizzaDettaglio(app, id) {
  app.append(spinner());
  const userId = state.sessione.user.id;
  const [p, iscritti, squadre, marcatori, risultati, votiCC, medie, mvpMio, mvpRis, candidati] = await Promise.all([
    singolaPartita(id), iscrittiPartita(id), squadrePartita(id),
    marcatoriPartita(id), risultatiPartita(id).catch(() => []),
    votiConCommentiPartita(id), medieVotiPartita(id),
    mioMVPScelto(id, userId).catch(() => null),
    risultatoMVP(id).catch(() => []),
    candidatiMVP(id).catch(() => []),
  ]);
  app.innerHTML = '';

  const num = iscritti.filter(g => !g.in_attesa).length;
  const inAttesa = iscritti.length - num;

  const statoBadge = { programmata: el('span', { class: 'badge' }, ['Programmata']),
    giocata: el('span', { class: 'badge badge-blu' }, ['Giocata']),
    annullata: el('span', { class: 'badge badge-rosso' }, ['Annullata']) }[p.stato];

  app.append(el('div', { class: 'hero' }, [
    el('div', { class: 'hero-etichetta' }, ['📅 Partita']),
    el('div', { class: 'hero-data' }, [fmtData(p.data) + ' · ' + p.ora.slice(0, 5)]),
    el('div', { class: 'hero-luogo' }, ['📍 ' + (p.luogo || '—')]),
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
      statoBadge,
      el('span', { class: 'badge', style: 'background:rgba(255,255,255,.2);color:#fff' },
        [`👥 ${num}/${p.max_giocatori}` + (inAttesa ? ` (+${inAttesa} attesa)` : '')]),
      el('span', { class: 'badge', style: 'background:rgba(255,255,255,.2);color:#fff' },
        [`🧢 ${p.num_squadre || 2} sq × ${p.giocatori_per_squadra || 5}`]),
    ]),
    p.stato !== 'annullata' ? el('button', {
      class: 'btn btn-ghost btn-mini', style: 'margin-top:10px;background:rgba(255,255,255,.2);color:#fff',
      onclick: () => scaricaICS(p),
    }, ['📆 Aggiungi al calendario']) : null,
  ]));

  // Risultato e marcatori
  // FIX: con 3+ squadre ci sono PIÙ risultati (uno per coppia), non più solo
  // gol_squadra_a/b — che restano valorizzati solo quando esiste una sfida
  // A-B. La card va quindi mostrata a "partita giocata", non più legata a
  // quel singolo campo, altrimenti spariva del tutto per le partite a 3+
  // squadre senza un confronto diretto A-B.
  if (p.stato === 'giocata') {
    const righeM = marcatori.map(m => el('div', { class: 'riga' }, [
      avatar(m.profilo, 34),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [nomeProfilo(m.profilo)]),
        m.autogol ? el('div', { class: 'riga-sub' }, [`${m.autogol} autogol`]) : null,
      ]),
      el('span', { class: 'badge badge-arancio' }, [`${m.gol} ⚽`]),
    ]));
    const righeRisultati = risultati.length
      ? risultati.map(r => el('div', {
          style: 'font-size:' + (risultati.length > 1 ? '20px' : '30px') +
            ';font-weight:900;text-align:center;margin-bottom:4px' },
          [`Squadra ${r.squadra_a} ${r.gol_a} – ${r.gol_b} Squadra ${r.squadra_b}`]))
      : [el('div', { class: 'vuoto' }, ['Risultato non ancora inserito'])];
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['🏁 Risultato' + (risultati.length > 1 ? 'i' : '')]),
      ...righeRisultati,
      el('div', { style: 'height:6px' }),
      marcatori.length ? righeM : el('div', { class: 'vuoto' }, ['Nessun marcatore registrato']),
    ]));

    const miaSquadra = squadre.find(g => g.id === userId)?.squadra;
    if (p.votazione_aperta) {
      const scaduta = p.votazione_scadenza && new Date(p.votazione_scadenza) < new Date();
      const mancaQualcosa = miaSquadra
        ? squadre.some(g => g.id !== userId && !mieiVotiCheck(g)) : false;
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
  function mieiVotiCheck(g) {
    // controllo semplificato: senz'altro se l'utente non è votante della partita, è 0
    return false;
  }

  // Squadre multi-colonna
  if (squadre.length) {
    const nCol = Math.max(2, Math.min(4, p.num_squadre || 2));
    const cols = ['A','B','C','D'].slice(0, nCol).map(lettera => {
      const giocatori = squadre.filter(g => (g.squadra || '').toUpperCase() === lettera);
      const allenatore = giocatori.find(g => g.ruolo === 'allenatore');
      const jolly = giocatori.filter(g => g.ruolo === 'jolly');
      const normali = giocatori.filter(g => g.ruolo !== 'allenatore' && g.ruolo !== 'jolly');
      const col = COLORI_SQUADRA[lettera];
      const riga = (g, etichettaRuolo) => el('div', { class: 'riga', style: 'padding:5px 0;border:none' }, [
        avatar(g, 30),
        el('div', { class: 'riga-testo' }, [
          el('span', { style: 'font-size:13.5px;font-weight:600' }, [nomeProfilo(g)]),
          etichettaRuolo ? el('div', { class: 'riga-sub' }, [etichettaRuolo]) : null,
          votiCC[g.id] && votiCC[g.id].num_voti
            ? el('div', { class: 'riga-sub' },
                [`⭐ ${Number(votiCC[g.id].media_voto).toFixed(1)} (${votiCC[g.id].num_voti} voti)`])
            : null,
        ]),
      ]);
      return el('div', {
        class: 'squadra-col',
        style: `background:${col.bg};min-width:0;`,
      }, [
        el('div', { style: `font-weight:900;font-size:13px;margin-bottom:6px;color:${col.fg}` },
          [`${col.nome} (${giocatori.length})`]),
        allenatore ? riga(allenatore, '👔 Allenatore') : null,
        ...normali.map(g => riga(g, null)),
        ...(jolly.length ? jolly.map(g => el('div', {}, [
          el('div', { class: 'riga', style: 'padding:5px 0;border:none' }, [
            avatar(g, 30),
            el('div', { class: 'riga-testo' }, [
              el('span', { style: 'font-size:13.5px;font-weight:600' }, [nomeProfilo(g)]),
              el('div', { class: 'riga-sub' }, ['🎭 Jolly in più squadre']),
            ]),
          ]),
        ])) : []),
      ]);
    });
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['👥 Squadre']),
      el('div', { class: 'squadre-grid', style: `grid-template-columns:repeat(${nCol},1fr)` }, cols),
    ]));
  }

  // Voti con commenti anonimi (solo giocatori che hanno partecipato)
  // FIX: il filtro "g.id !== userId" escludeva SEMPRE il giocatore che sta
  // guardando la pagina, impedendogli di vedere i PROPRI voti ricevuti —
  // sembrava un filtro bloccato sulla propria persona. I voti sono anonimi
  // solo rispetto a CHI ha votato, non vanno nascosti a CHI è stato votato.
  if (p.stato === 'giocata' && squadre.some(g => g.id === userId)) {
    const vistiVotiCC = new Set(); // evita righe duplicate per i "jolly" in più squadre
    const bloccoVoti = squadre
      .filter(g => {
        if (!votiCC[g.id] || !votiCC[g.id].num_voti) return false;
        if (vistiVotiCC.has(g.id)) return false;
        vistiVotiCC.add(g.id);
        return true;
      })
      .map(g => {
        const v = votiCC[g.id];
        const listaCommenti = (v.commenti_anonimi || []).map(cv =>
          el('div', { class: 'riga-sub' },
            [`⭐ ${cv.voto} — "${cv.commento || ''}"`]));
        return el('div', { class: 'riga', style: 'align-items:flex-start' }, [
          avatar(g, 38),
          el('div', { class: 'riga-testo' }, [
            el('div', { class: 'riga-titolo' }, [
              nomeProfilo(g),
              el('span', { class: 'badge', style: 'margin-left:6px' },
                [`⭐ ${Number(v.media_voto).toFixed(1)} (${v.num_voti} voti)`]),
            ]),
            el('div', { class: 'vuoto', style: 'padding:6px 0;text-align:left' },
              listaCommenti.length ? listaCommenti : ['(nessun commento)']),
          ]),
        ]);
      });
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['💬 Voti e commenti (anonimi)']),
      bloccoVoti.length ? bloccoVoti : el('div', { class: 'vuoto' }, ['Ancora nessun voto.']),
    ]));
  }

  // MVP risultato
  if (mvpRis && mvpRis.length) {
    const vincitore = mvpRis[0];
    const podio = mvpRis.slice(0, 3);
    app.append(el('div', { class: 'card', style: 'border-left:5px solid var(--verde)' }, [
      el('div', { class: 'card-titolo' }, ['🌟 MVP della partita']),
      el('div', { class: 'riga' }, [
        avatar(vincitore, 50),
        el('div', { class: 'riga-testo' }, [
          el('div', { class: 'riga-titolo' }, [nomeProfilo(vincitore)]),
          el('div', { class: 'riga-sub' }, [`${vincitore.num_voti_mvp} preferenze MVP`]),
        ]),
        el('span', { class: 'voto-badge voto-alto' }, ['🏆']),
      ]),
      podio.length > 1 ? el('div', { class: 'riga-sub', style: 'margin-top:8px' },
        ['Top 3: ' + podio.map(p => `${nomeProfilo(p)} (${p.num_voti_mvp})`).join(' · ')]) : null,
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
