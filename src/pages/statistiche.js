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
  const [m, sq, gl, vt, mvpv, rc] = await Promise.all([
    sb.from('matches').select('id,data,stato,gol_squadra_a,gol_squadra_b'),
    sb.from('squadre').select('giocatore_id,squadra,match_id'),
    sb.from('goals').select('giocatore_id,autogol,match_id'),
    sb.from('vista_voti_per_partita').select('match_id,data,votato_id,media_voto,num_voti'),
    // FIX: l'MVP è una scelta singola dei "tuttofare" (tabella mvp_votes),
    // NON ha nulla a che fare con la media dei voti 1-10 ai giocatori.
    sb.from('vista_mvp_risultato').select('match_id,data,candidato_id,num_voti_mvp'),
    // Risultati a coppie: con 3+ squadre una partita ne ha più di uno
    // (es. A-B, A-C, B-C), non più un solo gol_squadra_a/b.
    sb.from('risultati_coppie').select('match_id,squadra_a,squadra_b,gol_a,gol_b'),
  ]);
  const partite = m.data || [], squadre = sq.data || [], gol = gl.data || [], voti = vt.data || [];
  const mvpVoti = mvpv.data || [];
  const risultati = rc.data || [];
  app.innerHTML = '';

  // ------------------ Calcolo statistiche per stagione ------------------
  const annoDi = (data) => new Date(data + 'T12:00:00').getFullYear();
  // Le stagioni selezionabili sono quelle con almeno una partita, PIÙ l'anno
  // corrente e il prossimo (così si può già preparare "Stagione 2027" prima
  // che esista una partita giocata in quell'anno). Si aggiorna da solo ogni
  // 1° gennaio, senza bisogno di toccare il codice ogni anno.
  const annoOggi = new Date().getFullYear();
  const annid = [...new Set([
    ...partite.map(p => annoDi(p.data)), annoOggi, annoOggi + 1,
  ])].sort((a, b) => b - a);

  function statisticheAnno(anno) {
    // anno = numero dell'anno, oppure null = tutte le stagioni
    const partiteAnno = partite.filter(p => p.stato === 'giocata' && (anno === null || annoDi(p.data) === anno));
    const idPartite = new Set(partiteAnno.map(p => p.id));
    const agg = {}; // id -> { presenze, vittorie, pareggi, sconfitte, gol }
    const tocca = (id) => (agg[id] ??= { presenze: 0, vittorie: 0, pareggi: 0, sconfitte: 0, gol: 0 });

    // FIX: con 3+ squadre una partita ha PIÙ risultati (una sfida per ogni
    // coppia di squadre che si è affrontata). Un giocatore accumula un
    // esito (V/P/S) per OGNI sfida della sua squadra in quella partita —
    // con 3 squadre può ottenere fino a 2 esiti nella stessa serata.
    // Indicizza i risultati per partita, per un lookup veloce.
    const risultatiPerMatch = new Map();
    for (const r of risultati) {
      if (!idPartite.has(r.match_id)) continue;
      const l = risultatiPerMatch.get(r.match_id) ?? [];
      l.push(r); risultatiPerMatch.set(r.match_id, l);
    }
    for (const s of squadre.filter(x => idPartite.has(x.match_id))) {
      const a = tocca(s.giocatore_id);
      a.presenze++;
      const miaSq = (s.squadra || '').toUpperCase();
      for (const r of (risultatiPerMatch.get(s.match_id) || [])) {
        const ra = (r.squadra_a || '').toUpperCase(), rb = (r.squadra_b || '').toUpperCase();
        if (miaSq !== ra && miaSq !== rb) continue;
        const mio = miaSq === ra ? r.gol_a : r.gol_b;
        const avv = miaSq === ra ? r.gol_b : r.gol_a;
        if (mio > avv) a.vittorie++;
        else if (mio === avv) a.pareggi++;
        else a.sconfitte++;
      }
    }
    for (const g of gol.filter(x => !x.autogol && idPartite.has(x.match_id))) tocca(g.giocatore_id).gol++;
    // medie voti per giocatore nell'anno
    // FIX: con anno===null ("Tutte le stagioni") il confronto diretto con
    // annoDi(x.data) non è mai vero, quindi la media voti risultava sempre
    // vuota per tutti sotto "Tutte" — qui manca lo stesso "anno === null ||"
    // già usato correttamente per partite, MVP e le altre sezioni.
    const sommaVoti = {}; // id -> { sommaPonderata, nVoti }
    for (const v of voti.filter(x => anno === null || annoDi(x.data) === anno)) {
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

    // FIX: MVP reale, basato sui voti "tuttofare" (mvp_votes / vista_mvp_risultato),
    // NON sulla media dei voti 1-10 ai giocatori (che è tutt'altra classifica,
    // vedi "⭐ Miglior giocatore" più sotto).
    const mvpFiltrati = mvpVoti.filter(x => anno === null || annoDi(x.data) === anno);
    const perPartitaMVP = new Map();
    for (const v of mvpFiltrati) {
      const l = perPartitaMVP.get(v.match_id) ?? [];
      l.push(v); perPartitaMVP.set(v.match_id, l);
    }
    // Vincitore/i per ogni partita (in caso di parità, MVP condiviso da più giocatori)
    const mvpPerPartita = [];
    for (const [mid, lista2] of perPartitaMVP) {
      const max = Math.max(...lista2.map(x => x.num_voti_mvp));
      const vincitori = lista2.filter(x => x.num_voti_mvp === max).map(x => x.candidato_id);
      mvpPerPartita.push({ match_id: mid, data: lista2[0].data, vincitori, voti: max });
    }
    mvpPerPartita.sort((a, b) => b.data.localeCompare(a.data));

    // Classifica: quante volte ogni giocatore ha vinto l'MVP nelle partite passate
    const conteggioMVP = {};
    for (const r of mvpPerPartita) for (const gid of r.vincitori)
      conteggioMVP[gid] = (conteggioMVP[gid] || 0) + 1;
    const classificaMVP = Object.entries(conteggioMVP)
      .map(([gid, n]) => ({ giocatore_id: gid, ...(profiloPerId(gid) || {}), vittorieMVP: n }))
      .sort((a, b) => b.vittorieMVP - a.vittorieMVP);

    const topVoti = lista.filter(s => s.idoneo && s.num_voti > 0).sort((a, b) => b.media_voti - a.media_voti);
    const cannonieri = lista.filter(s => s.gol > 0)
      .sort((a, b) => b.gol - a.gol || (b.gol / Math.max(b.presenze, 1)) - (a.gol / Math.max(a.presenze, 1)));
    const presenze = lista.filter(s => s.presenze > 0).sort((a, b) => b.presenze - a.presenze);
    const perRuolo = {};
    for (const ruolo of ['portiere', 'difensore', 'centrocampista', 'attaccante']) {
      const best = topVoti.filter(s => s.ruolo_preferito === ruolo)[0];
      if (best) perRuolo[ruolo] = best;
    }

    // Barretta orizzontale sotto ogni riga di classifica, proporzionale al
    // valore rispetto al massimo della lista (0-100%). Puramente visuale,
    // nessuna libreria esterna: un div con una larghezza in percentuale.
    const barraRank = (percentuale) => el('div', { class: 'barra-rank-sfondo' }, [
      el('div', { class: 'barra-rank', style: `width:${Math.max(0, Math.min(100, percentuale))}%` }),
    ]);

    const riga = (s, i, badgeHtml, valore, cls = '', percentuale = null) => el('div', { class: 'riga' }, [
      el('span', { class: 'pos-medaglia' }, [MEDAGLIE[i] || (i >= 0 ? `${i + 1}.` : '•')]),
      avatar(s, 36),
      el('div', { class: 'riga-testo' }, [
        el('a', { class: 'riga-titolo', style: 'text-decoration:none;color:inherit', href: `#/profilo/${s.giocatore_id}` },
          [nomeProfilo(s)]),
        el('div', { class: 'riga-sub' }, [badgeHtml]),
        percentuale !== null ? barraRank(percentuale) : null,
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

    // Scala voti fissa (1-10): la barra riflette il voto reale, non solo
    // il confronto fra i primi in classifica. Gol/presenze/MVP invece non
    // hanno un massimo teorico, quindi si scalano sul valore più alto
    // presente in quella specifica lista.
    const maxGol = Math.max(1, ...cannonieri.map(s => s.gol), 0);
    const maxPresenze = Math.max(1, ...presenze.map(s => s.presenze), 0);
    const maxMVP = Math.max(1, ...classificaMVP.map(s => s.vittorieMVP), 0);

    app.append(card(`⭐ Miglior giocatore (min. ${imp.min_partite_classifica} partite)`,
      topVoti.map((s, i) => riga(s, i, `${s.num_voti} voti · ${s.presenze} partite`,
        s.media_voti.toFixed(2), s.media_voti >= 7 ? 'voto-alto' : '', (s.media_voti / 10) * 100))));

    app.append(card('⚽ Capocannoniere',
      cannonieri.map((s, i) => riga(s, i,
        `${(s.gol / Math.max(s.presenze, 1)).toFixed(2)} gol/partita · ${s.presenze} partite`,
        `${s.gol} ⚽`, '', (s.gol / maxGol) * 100))));

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
          barraRank((s.presenze / maxPresenze) * 100),
        ]),
        el('span', { class: 'voto-badge' }, [s.presenze]),
      ]))));

    // NOTA: lo storico "partita per partita" dell'MVP non va ripetuto qui —
    // è già mostrato, meglio contestualizzato, nella pagina della singola
    // partita (card "🌟 MVP della partita"). Qui in Statistiche (vista
    // aggregata) resta solo la classifica cumulativa.
    app.append(card('🌟 Classifica MVP (premi vinti)',
      classificaMVP.map((s, i) => el('div', { class: 'riga' }, [
        el('span', { class: 'pos-medaglia' }, [MEDAGLIE[i] || `${i + 1}.`]),
        avatar(s, 36),
        el('div', { class: 'riga-testo' }, [
          el('a', { class: 'riga-titolo', style: 'text-decoration:none;color:inherit',
            href: `#/profilo/${s.giocatore_id}` }, [nomeProfilo(s)]),
          barraRank((s.vittorieMVP / maxMVP) * 100),
        ]),
        el('span', { class: 'voto-badge voto-alto' }, [`🏆 ${s.vittorieMVP}`]),
      ]))));

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
