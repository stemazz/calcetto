// ============================================================================
// STATISTICHE — classifica giocatori, capocannonieri, MVP, presenze, V/P/S,
// migliori per ruolo, filtro stagione e pagina personale con grafico.
// I dati aggregati sono calcolati qui dalle tabelle grezze, così il filtro
// stagione è esatto e si aggiorna da solo dopo ogni correzione admin.
// ============================================================================
import { state, profiloPerId } from '../state.js';
import { sb } from '../supabase.js';
import { getImpostazioni } from '../api.js';
import { el, avatar, nomeProfilo, spinner, vuoto, fmtData } from '../ui.js';

const MEDAGLIE = ['🥇', '🥈', '🥉'];

export async function renderizzaStatistiche(app, profiloId) {
  if (profiloId) { await paginaPersonale(app, profiloId); return; }
  app.append(spinner());

  // Carica le tabelle grezze (piccole: ~20 giocatori, poche decine di partite)
  const [m, sq, gl, vt] = await Promise.all([
    sb.from('matches').select('id,data,stato,gol_squadra_a,gol_squadra_b'),
    sb.from('squadre').select('giocatore_id,squadra,match_id'),
    sb.from('goals').select('giocatore_id,autogol,match_id'),
    sb.from('vista_voti_per_partita').select('match_id,data,votato_id,media_voto,num_voti'),
  ]);
  const partite = m.data || [], squadre = sq.data || [], gol = gl.data || [], voti = vt.data || [];
  app.innerHTML = '';

  // ------------------ Calcolo statistiche per stagione ------------------
  const annoDi = (data) => new Date(data + 'T12:00:00').getFullYear();
  const annid = [...new Set(partite.map(p => annoDi(p.data)))].sort((a, b) => b - a);

  function statisticheAnno(anno) {
    // anno = numero dell'anno, oppure null = tutte le stagioni
    const partiteAnno = partite.filter(p => p.stato === 'giocata' && (anno === null || annoDi(p.data) === anno));
    const idPartite = new Set(partiteAnno.map(p => p.id));
    const agg = {}; // id -> { presenze, vittorie, pareggi, sconfitte, gol }
    const tocca = (id) => (agg[id] ??= { presenze: 0, vittorie: 0, pareggi: 0, sconfitte: 0, gol: 0 });
    for (const s of squadre.filter(x => idPartite.has(x.match_id))) {
      const p = partiteAnno.find(x => x.id === s.match_id);
      const a = tocca(s.giocatore_id);
      a.presenze++;
      if (p.gol_squadra_a === p.gol_squadra_b) a.pareggi++;
      else if ((s.squadra === 'A') === (p.gol_squadra_a > p.gol_squadra_b)) a.vittorie++;
      else a.sconfitte++;
    }
    for (const g of gol.filter(x => !x.autogol && idPartite.has(x.match_id))) tocca(g.giocatore_id).gol++;
    // medie voti per giocatore nell'anno
    const sommaVoti = {}; // id -> { sommaPonderata, nVoti }
    for (const v of voti.filter(x => annoDi(x.data) === anno)) {
      const o = sommaVoti[v.votato_id] ??= { somma: 0, n: 0 };
      o.somma += Number(v.media_voto) * v.num_voti;
      o.n += v.num_voti;
    }
    return { partiteAnno, agg, sommaVoti };
  }

  function righeClassifica(anno, imp) {
    const { agg, sommaVoti } = statisticheAnno(anno);
    return Object.entries(agg).map(([id, a]) => {
      const v = sommaVoti[id];
      const pr = profiloPerId(id) || {};
      return { giocatore_id: id, ...pr, ...a,
        media_voti: v ? v.somma / v.n : 0, num_voti: v ? v.n : 0,
        idoneo: a.presenze >= imp.min_partite_classifica };
    });
  }

  // ------------------ Intestazione + filtro stagione ------------------
  const imp = await getImpostazioni();
  let annoSel = 'tutte';
  const tab = el('div', { class: 'tab-bar' });
  const opzioni = [['tutte', 'Tutte'], ...annid.map(a => [String(a), `Stagione ${a}`])];
  for (const [chiave, etichetta] of opzioni) {
    const b = el('button', { class: 'tab-btn' }, [etichetta]);
    b.addEventListener('click', () => { annoSel = chiave; disegna(); });
    b.dataset.chiave = chiave;
    tab.append(b);
  }

  function annoCorrente() { return annoSel === 'tutte' ? null : Number(annoSel); }

  function disegna() {
    for (const b of tab.querySelectorAll('.tab-btn'))
      b.classList.toggle('attiva', b.dataset.chiave === annoSel);

    const anno = annoCorrente();
    // righeClassifica già filtra per anno (null = tutte le stagioni)
    const lista = righeClassifica(anno, imp);

    // MVP per partita (nell'anno selezionato)
    const perPartita = new Map();
    for (const v of voti.filter(x => anno === null || annoDi(x.data) === anno)) {
      const l = perPartita.get(v.match_id) ?? [];
      l.push(v); perPartita.set(v.match_id, l);
    }
    const mvp = [];
    for (const [mid, lista2] of perPartita) {
      const best = lista2.reduce((a, b) =>
        (b.media_voto > a.media_voto || (b.media_voto === a.media_voto && b.num_voti > a.num_voti)) ? b : a);
      mvp.push({ ...best, data: best.data });
    }
    mvp.sort((a, b) => b.data.localeCompare(a.data));

    const topVoti = lista.filter(s => s.idoneo && s.num_voti > 0).sort((a, b) => b.media_voti - a.media_voti);
    const cannonieri = lista.filter(s => s.gol > 0)
      .sort((a, b) => b.gol - a.gol || (b.gol / Math.max(b.presenze, 1)) - (a.gol / Math.max(a.presenze, 1)));
    const presenze = lista.filter(s => s.presenze > 0).sort((a, b) => b.presenze - a.presenze);
    const perRuolo = {};
    for (const ruolo of ['portiere', 'difensore', 'centrocampista', 'attaccante']) {
      const best = topVoti.filter(s => s.ruolo_preferito === ruolo)[0];
      if (best) perRuolo[ruolo] = best;
    }

    const riga = (s, i, badgeHtml, valore, cls = '') => el('div', { class: 'riga' }, [
      el('span', { class: 'pos-medaglia' }, [MEDAGLIE[i] || (i >= 0 ? `${i + 1}.` : '•')]),
      avatar(s, 36),
      el('div', { class: 'riga-testo' }, [
        el('a', { class: 'riga-titolo', style: 'text-decoration:none;color:inherit', href: `#/profilo/${s.giocatore_id}` },
          [nomeProfilo(s)]),
        el('div', { class: 'riga-sub' }, [badgeHtml]),
      ]),
      el('span', { class: 'voto-badge ' + cls }, [String(valore)]),
    ]);

    app.innerHTML = '';
    app.append(el('h2', { style: 'margin:4px 0 12px;font-size:20px' }, ['📊 Statistiche']));
    app.append(tab);

    const card = (titolo, righe) => el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, [titolo]),
      righe.length ? righe : vuoto('Dati insufficienti'),
    ]);

    // Le mie statistiche veloci
    const io = lista.find(s => s.giocatore_id === state.sessione.user.id);
    if (io) {
      app.append(el('a', { class: 'card', style: 'display:block;text-decoration:none;color:inherit',
        href: `#/profilo/${io.giocatore_id}` }, [
        el('div', { class: 'card-titolo' }, ['👤 Le tue statistiche']),
        el('div', { class: 'stat-grid' }, [
          statBox(io.media_voti ? io.media_voti.toFixed(2) : '—', 'media voti'),
          statBox(io.gol, 'gol'), statBox(io.presenze, 'presenze'),
        ]),
      ]));
    }

    app.append(card(`⭐ Miglior giocatore (min. ${imp.min_partite_classifica} partite)`,
      topVoti.map((s, i) => riga(s, i, `${s.num_voti} voti · ${s.presenze} partite`,
        s.media_voti.toFixed(2), s.media_voti >= 7 ? 'voto-alto' : ''))));

    app.append(card('⚽ Capocannoniere',
      cannonieri.map((s, i) => riga(s, i,
        `${(s.gol / Math.max(s.presenze, 1)).toFixed(2)} gol/partita · ${s.presenze} partite`, `${s.gol} ⚽`))));

    app.append(card('🏃 Presenze e bilancio V-P-S',
      presenze.map((s, i) => el('div', { class: 'riga' }, [
        el('span', { class: 'pos-medaglia' }, [MEDAGLIE[i] || `${i + 1}.`]),
        avatar(s, 34),
        el('div', { class: 'riga-testo' }, [
          el('a', { class: 'riga-titolo', style: 'font-size:14px;text-decoration:none;color:inherit',
            href: `#/profilo/${s.giocatore_id}` }, [nomeProfilo(s)]),
          el('div', { class: 'riga-sub' }, [
            el('span', { class: 'badge badge-blu' }, [`${s.vittorie}V`]), ' ',
            el('span', { class: 'badge badge-grigio' }, [`${s.pareggi}P`]), ' ',
            el('span', { class: 'badge badge-rosso' }, [`${s.sconfitte}S`]),
          ]),
        ]),
        el('span', { class: 'voto-badge' }, [s.presenze]),
      ]))));

    app.append(card('🌟 MVP partita per partita',
      mvp.map(mm => {
        const pr = profiloPerId(mm.votato_id);
        return el('div', { class: 'riga' }, [
          avatar(pr || { nome: '?' }, 36),
          el('div', { class: 'riga-testo' }, [
            el('div', { class: 'riga-titolo' }, [nomeProfilo(pr)]),
            el('div', { class: 'riga-sub' }, [fmtData(mm.data)]),
          ]),
          el('span', { class: 'voto-badge voto-alto' }, [Number(mm.media_voto).toFixed(1)]),
        ]);
      })));

    const icone = { portiere: '🧤', difensore: '🛡️', centrocampista: '⚙️', attaccante: '🎯' };
    app.append(card('🧤 Migliori per ruolo', Object.entries(perRuolo).map(([ruolo, s]) =>
      riga(s, -1, `${icone[ruolo]} ${ruolo}`, s.media_voti.toFixed(2)))));
  }

  disegna();
}

function statBox(valore, etichetta) {
  return el('div', { class: 'stat-box' }, [
    el('div', { class: 'stat-valore' }, [String(valore)]),
    el('div', { class: 'stat-etichetta' }, [etichetta]),
  ]);
}

/** Pagina statistiche personali (riutilizzata dal profilo) */
async function paginaPersonale(app, profiloId) {
  location.hash = `#/profilo/${profiloId}`;
}
