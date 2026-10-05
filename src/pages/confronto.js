// ============================================================================
// CONFRONTO — statistiche testa a testa tra due giocatori a scelta.
// ============================================================================
import { listaProfili, statisticheGlobali } from '../api.js';
import { el, avatar, nomeProfilo, spinner, vuoto } from '../ui.js';

export async function renderizzaConfronto(app) {
  app.append(spinner());
  const [profili, stats] = await Promise.all([listaProfili(), statisticheGlobali()]);
  app.innerHTML = '';
  app.append(el('a', { href: '#/statistiche', class: 'riga-sub',
    style: 'display:block;margin-bottom:8px;text-decoration:none' }, ['← Statistiche']));
  app.append(el('h2', { style: 'margin:4px 0 12px;font-size:20px' }, ['🆚 Confronta giocatori']));

  const opzioni = (selezionato) => [
    el('option', { value: '' }, ['— scegli un giocatore —']),
    ...profili.map(g => el('option', { value: g.id, ...(g.id === selezionato ? { selected: '' } : {}) },
      [nomeProfilo(g)])),
  ];
  const sel1 = el('select', { class: 'input' }, opzioni(profili[0]?.id));
  const sel2 = el('select', { class: 'input' }, opzioni(profili[1]?.id));

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'form-riga' }, [
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Giocatore 1']), sel1]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Giocatore 2']), sel2]),
    ]),
  ]));

  const risultato = el('div');
  app.append(risultato);

  function riga(etichetta, v1, v2, formato = (x) => String(x)) {
    const n1 = Number(v1) || 0, n2 = Number(v2) || 0;
    return el('div', { class: 'confronto-riga' }, [
      el('span', { class: 'confronto-val' + (n1 > n2 ? ' confronto-vince' : '') }, [formato(v1)]),
      el('span', { class: 'confronto-etichetta' }, [etichetta]),
      el('span', { class: 'confronto-val' + (n2 > n1 ? ' confronto-vince' : '') }, [formato(v2)]),
    ]);
  }

  function disegna() {
    risultato.innerHTML = '';
    const s1 = stats.find(s => s.giocatore_id === sel1.value);
    const s2 = stats.find(s => s.giocatore_id === sel2.value);
    if (!sel1.value || !sel2.value) {
      risultato.append(vuoto('Scegli due giocatori da confrontare.'));
      return;
    }
    if (sel1.value === sel2.value) {
      risultato.append(vuoto('Scegli due giocatori diversi.'));
      return;
    }
    if (!s1 || !s2) {
      risultato.append(vuoto('Dati statistici non ancora disponibili per uno dei due.'));
      return;
    }
    const p1 = profili.find(g => g.id === sel1.value);
    const p2 = profili.find(g => g.id === sel2.value);
    const golPartita1 = s1.gol / Math.max(s1.presenze, 1);
    const golPartita2 = s2.gol / Math.max(s2.presenze, 1);

    risultato.append(el('div', { class: 'card' }, [
      el('div', { class: 'confronto-intestazione' }, [
        el('div', { style: 'text-align:center' }, [avatar(p1, 52), el('div', { style: 'font-weight:800;margin-top:4px' }, [nomeProfilo(p1)])]),
        el('div', { style: 'font-size:20px;font-weight:900;color:var(--testo-debole)' }, ['VS']),
        el('div', { style: 'text-align:center' }, [avatar(p2, 52), el('div', { style: 'font-weight:800;margin-top:4px' }, [nomeProfilo(p2)])]),
      ]),
      el('div', { style: 'margin-top:14px' }, [
        riga('Media voti', s1.media_voti, s2.media_voti, (x) => Number(x || 0).toFixed(2)),
        riga('Gol totali', s1.gol, s2.gol),
        riga('Gol/partita', golPartita1, golPartita2, (x) => Number(x).toFixed(2)),
        riga('Presenze', s1.presenze, s2.presenze),
        riga('Vittorie', s1.vittorie, s2.vittorie),
        riga('Pareggi', s1.pareggi, s2.pareggi),
        riga('Sconfitte', s1.sconfitte, s2.sconfitte),
      ]),
    ]));
  }

  sel1.addEventListener('change', disegna);
  sel2.addEventListener('change', disegna);
  disegna();
}
