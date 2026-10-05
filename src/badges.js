// ============================================================================
// BADGE / ACHIEVEMENT — calcolo puro (nessuna chiamata di rete qui dentro),
// a partire dai dati grezzi già caricati altrove. I dati necessari si
// recuperano con api.js -> datiBadge(giocatoreId).
// ============================================================================

/**
 * Calcola i badge di un giocatore.
 * @param {object} p
 * @param {object} p.stats - riga di statisticheGlobali() per questo giocatore (può essere undefined)
 * @param {{id:string}[]} p.partiteGiocate - TUTTE le partite con stato 'giocata', ordinate per data crescente
 * @param {{match_id:string}[]} p.squadreGiocatore - righe "squadre" di questo giocatore (una per partita a cui ha preso parte)
 * @param {{match_id:string, candidato_id:string}[]} p.mvpVoti - TUTTI i voti MVP di TUTTE le partite
 * @param {string} p.giocatoreId
 * @returns {{icona:string, nome:string, descrizione:string, ottenuto:boolean}[]}
 */
export function calcolaBadge({ stats, partiteGiocate, squadreGiocatore, mvpVoti, giocatoreId }) {
  const presenze = stats?.presenze || 0;
  const gol = stats?.gol || 0;
  const mediaVoti = Number(stats?.media_voti || 0);
  const numVoti = stats?.num_voti || 0;

  // --- striscia di presenze consecutive (sulle partite giocate, in ordine di data) ---
  const idGiocate = new Set((squadreGiocatore || []).map(s => s.match_id));
  let streakMax = 0, streakAttuale = 0;
  for (const m of partiteGiocate || []) {
    if (idGiocate.has(m.id)) { streakAttuale++; streakMax = Math.max(streakMax, streakAttuale); }
    else streakAttuale = 0;
  }

  // --- premi MVP vinti: stesso algoritmo "vincitore per partita" di Statistiche ---
  const perPartita = new Map();
  for (const v of mvpVoti || []) {
    const l = perPartita.get(v.match_id) ?? [];
    l.push(v.candidato_id);
    perPartita.set(v.match_id, l);
  }
  let mvpVinti = 0;
  for (const [, candidati] of perPartita) {
    const conteggio = {};
    for (const c of candidati) conteggio[c] = (conteggio[c] || 0) + 1;
    const max = Math.max(...Object.values(conteggio));
    const vincitori = Object.entries(conteggio).filter(([, n]) => n === max).map(([id]) => id);
    if (vincitori.includes(giocatoreId)) mvpVinti++;
  }

  return [
    { icona: '🎽', nome: 'Esordiente', descrizione: 'Prima presenza', ottenuto: presenze >= 1 },
    { icona: '🔥', nome: 'Habitué', descrizione: '5 presenze di fila', ottenuto: streakMax >= 5 },
    { icona: '📅', nome: 'Veterano', descrizione: '20 presenze totali', ottenuto: presenze >= 20 },
    { icona: '⚽', nome: 'A segno', descrizione: 'Primo gol', ottenuto: gol >= 1 },
    { icona: '🎯', nome: 'Cecchino', descrizione: '10 gol in carriera', ottenuto: gol >= 10 },
    { icona: '💥', nome: 'Bomber', descrizione: '25 gol in carriera', ottenuto: gol >= 25 },
    { icona: '🌟', nome: 'Sul podio', descrizione: 'Primo premio MVP', ottenuto: mvpVinti >= 1 },
    { icona: '👑', nome: 'Fenomeno', descrizione: '3 premi MVP', ottenuto: mvpVinti >= 3 },
    { icona: '📈', nome: 'Top player', descrizione: 'Media voto ≥ 8 (min. 5 voti ricevuti)',
      ottenuto: numVoti >= 5 && mediaVoti >= 8 },
  ];
}
