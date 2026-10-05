// ============================================================================
// AREA ADMIN — gestione completa (partite, utenti, voti, MVP, impostazioni).
// Include upload foto per un utente qualsiasi (admin flow).
// ============================================================================
import { state, profiloPerId } from '../state.js';
import {
  listaPartite, creaPartita, modificaPartita, eliminaPartita,
  iscrittiPartita, iscriviManuale, rimuoviDaPartita,
  squadrePartita, impostaSquadra, generaSquadreBilate, impostaAllenatore, segnaJolly,
  impostaRisultato, gestisciVotazione, marcatoriPartita,
  tuttiVoti, eliminaVoto, salvaVotoAdmin,
  listaProfili, aggiornaProfilo, impostaAttivo, resetPassword, cambiaEmail,
  promuoviAdmin, setTuttofare, eliminaUtente, eliminaDatiDemo,
  candidatiMVP, setCandidatiMVP,
  getImpostazioni, salvaImpostazioni,
  caricaFoto,
} from '../api.js';
import {
  el, avatar, nomeProfilo, toast, fmtData, fmtScadenza, oggiISO,
  selectVoto, ridimensiona, anteprimaImg,
} from '../ui.js';

export async function renderizzaAdmin(app) {
  app.innerHTML = '';
  app.append(el('h2', { style: 'margin:4px 0 12px;font-size:20px' }, ['⚙️ Area Admin']));

  const schede = [['partite','📅 Partite'],['utenti','👤 Utenti'],['voti','⭐ Voti'],['impostazioni','🛠️ Impostazioni']];
  const barra = el('div', { class: 'tab-bar' });
  const contenuto = el('div');
  for (const [chiave, etichetta] of schede) {
    const b = el('button', { class: 'tab-btn' }, [etichetta]);
    b.addEventListener('click', () => mostra(chiave));
    b.dataset.scheda = chiave;
    barra.append(b);
  }
  app.append(barra, contenuto);

  async function mostra(scheda) {
    for (const b of barra.querySelectorAll('.tab-btn'))
      b.classList.toggle('attiva', b.dataset.scheda === scheda);
    contenuto.innerHTML = '';
    contenuto.append(spinnerAdmin());
    try {
      if (scheda === 'partite') await schedaPartite(contenuto);
      if (scheda === 'utenti') await schedaUtenti(contenuto);
      if (scheda === 'voti') await schedaVoti(contenuto);
      if (scheda === 'impostazioni') await schedaImpostazioni(contenuto);
    } catch (e) { contenuto.innerHTML = ''; contenuto.append(el('div', { class: 'card vuoto' }, ['⚠️ ' + e.message])); }
  }
  await mostra('partite');
}

const spinnerAdmin = () => el('div', { class: 'spinner' }, ['⏳ Caricamento…']);
const conferma = (msg) => window.confirm(msg);

/* ================= PARTITE ================= */
async function schedaPartite(contenuto) {
  const partite = await listaPartite();
  contenuto.innerHTML = '';

  const fData = el('input', { class: 'input', type: 'date', value: oggiISO() });
  const fOra = el('input', { class: 'input', type: 'time', value: '19:00' });
  const fLuogo = el('input', { class: 'input', placeholder: 'Campo / luogo' });
  const fPosti = el('input', { class: 'input', type: 'number', min: 4, max: 30, value: 10 });
  const fNumSq = el('input', { class: 'input', type: 'number', min: 2, max: 4, value: 2 });
  const fGiocSq = el('input', { class: 'input', type: 'number', min: 3, max: 12, value: 5 });
  const btnNuova = el('button', { class: 'btn btn-primary btn-blocco' }, ['➕ Crea partita']);
  btnNuova.addEventListener('click', async () => {
    btnNuova.disabled = true;
    try {
      await creaPartita({ data: fData.value, ora: fOra.value, luogo: fLuogo.value.trim(),
        max_giocatori: Number(fPosti.value), num_squadre: Number(fNumSq.value),
        giocatori_per_squadra: Number(fGiocSq.value) });
      toast('Partita creata! 📅'); await schedaPartite(contenuto); return;
    } catch (e) { toast(e.message, 'errore'); }
    btnNuova.disabled = false;
  });
  contenuto.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['➕ Nuova partita']),
    el('div', { class: 'form' }, [
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Data']), fData]),
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Ora']), fOra]),
      ]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Luogo']), fLuogo]),
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Posti massimi']), fPosti]),
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['N° squadre (2-4)']), fNumSq]),
      ]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Giocatori per squadra']), fGiocSq]),
      btnNuova,
    ]),
  ]));

  const ordinate = [...partite].sort((a, b) => b.data.localeCompare(a.data));
  contenuto.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['📋 Gestione partite']),
    ordinate.length ? ordinate.map(p => rigaGestionePartita(p, contenuto)) : el('div', { class: 'vuoto' }, ['Nessuna partita']),
  ]));
}

function rigaGestionePartita(p, contenuto) {
  const badge = { programmata: el('span', { class: 'badge' }, ['Programmata']),
    giocata:    el('span', { class: 'badge badge-blu' }, ['Giocata']),
    annullata:  el('span', { class: 'badge badge-rosso' }, ['Annullata']) }[p.stato];
  const dettaglio = el('div', { style: 'display:none' });
  const apri = el('button', { class: 'btn btn-ghost btn-mini' }, ['Gestisci']);
  apri.addEventListener('click', async () => {
    if (dettaglio.style.display === 'none') {
      apri.textContent = 'Chiudi';
      dettaglio.style.display = '';
      dettaglio.innerHTML = '';
      dettaglio.append(spinnerAdmin());
      try { await riempiGestione(p, dettaglio, contenuto); }
      catch (e) { dettaglio.append(el('div', { class: 'vuoto' }, ['⚠️ ' + e.message])); }
    } else { apri.textContent = 'Gestisci'; dettaglio.style.display = 'none'; }
  });
  return el('div', {}, [
    el('div', { class: 'riga' }, [
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [fmtData(p.data) + ' · ' + p.ora.slice(0, 5)]),
        el('div', { class: 'riga-sub' },
          [(p.luogo || '—') + ` · ${p.num_squadre || 2} squadre × ${p.giocatori_per_squadra || 5}`]),
      ]),
      badge, apri,
    ]),
    dettaglio,
  ]);
}

async function riempiGestione(p, box, contenuto) {
  const [iscritti, squadre] = await Promise.all([iscrittiPartita(p.id), squadrePartita(p.id)]);
  const tutti = await listaProfili();
  const attivi = tutti.filter(g => g.attivo);
  const candidatiMVPList = await candidatiMVP(p.id).catch(() => []);
  // FIX: i gol/autogol già salvati vanno ricaricati, altrimenti il pannello
  // ripartiva sempre da zero e risalvare il risultato cancellava in
  // silenzio i marcatori già registrati per chi non veniva reinserito.
  const marcatoriEsistenti = p.stato === 'giocata'
    ? await marcatoriPartita(p.id).catch(() => [])
    : [];
  const golEsistenti = new Map(marcatoriEsistenti.map(m => [m.id, m]));
  box.innerHTML = '';
  const blocco = el('div', { class: 'admin-blocco' });

  // Dati
  const eData = el('input', { class: 'input', type: 'date', value: p.data });
  const eOra = el('input', { class: 'input', type: 'time', value: p.ora.slice(0, 5) });
  const eLuogo = el('input', { class: 'input', value: p.luogo });
  const ePosti = el('input', { class: 'input', type: 'number', min: 4, max: 30, value: p.max_giocatori });
  const eNumSq = el('input', { class: 'input', type: 'number', min: 2, max: 4, value: p.num_squadre || 2 });
  const eGiocSq = el('input', { class: 'input', type: 'number', min: 3, max: 12, value: p.giocatori_per_squadra || 5 });
  blocco.append(el('div', { class: 'sezione-titolo' }, ['✏️ Dati partita']));
  blocco.append(el('div', { class: 'form' }, [
    el('div', { class: 'form-riga' }, [
      el('div', { class: 'campo' }, [eData]), el('div', { class: 'campo' }, [eOra]),
    ]),
    el('div', { class: 'form-riga' }, [
      el('div', { class: 'campo' }, [eLuogo]), el('div', { class: 'campo' }, [ePosti]),
    ]),
    el('div', { class: 'form-riga' }, [
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['N° squadre']), eNumSq]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Gioc/squadra']), eGiocSq]),
    ]),
    el('button', { class: 'btn btn-primary btn-mini', onclick: async (e) => {
      e.target.disabled = true;
      try {
        await modificaPartita(p.id, { data: eData.value, ora: eOra.value,
          luogo: eLuogo.value.trim(), max_giocatori: Number(ePosti.value),
          num_squadre: Number(eNumSq.value),
          giocatori_per_squadra: Number(eGiocSq.value) });
        toast('Partita aggiornata.'); await riempiGestione(p, box, contenuto); return;
      } catch (err) { toast(err.message, 'errore'); }
      e.target.disabled = false;
    }}, ['Salva dati']),
  ]));

  // Stato
  blocco.append(el('div', { class: 'sezione-titolo' }, ['🚦 Stato']));
  const stati = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
  if (p.stato !== 'annullata') stati.append(el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
    if (!conferma('Annullare questa partita?')) return;
    await modificaPartita(p.id, { stato: 'annullata' }); toast('Partita annullata.'); await riempiGestione(p, box, contenuto);
  }}, ['❌ Annulla partita']));
  if (p.stato === 'annullata') stati.append(el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
    await modificaPartita(p.id, { stato: 'programmata' }); toast('Partita riattivata.'); await riempiGestione(p, box, contenuto);
  }}, ['♻️ Riattiva']));
  stati.append(el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
    if (!conferma('Eliminare DEFINITIVAMENTE la partita e tutti i suoi dati?')) return;
    await eliminaPartita(p.id); toast('Partita eliminata.'); await schedaPartite(contenuto);
  }}, ['🗑 Elimina']));
  blocco.append(stati);

  // Iscritti
  blocco.append(el('div', { class: 'sezione-titolo' },
    [`👥 Iscritti (${iscritti.filter(g => !g.in_attesa).length}/${p.max_giocatori})`]));
  const idIscritti = new Set(iscritti.map(g => g.id));
  // FIX: blocco.append() è il metodo nativo del browser, non l'helper el().
  // Passargli un array (il risultato di .map()) lo trasforma in testo
  // ("[object HTMLDivElement]" ripetuto) invece di inserire i singoli
  // elementi: va "spacchettato" con l'operatore spread (...).
  blocco.append(...iscritti.map(g => el('div', { class: 'riga' }, [
    avatar(g, 30), el('div', { class: 'riga-testo' }, [
      el('div', { class: 'riga-titolo', style: 'font-size:14px' }, [nomeProfilo(g)]),
      g.in_attesa ? el('div', { class: 'riga-sub' }, ['in lista d\'attesa']) : null,
    ]),
    el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
      await rimuoviDaPartita(p.id, g.id); toast('Giocatore rimosso.');
      await riempiGestione(p, box, contenuto);
    }}, ['Rimuovi']),
  ])));
  const selettore = el('select', { class: 'input', style: 'min-height:40px' },
    [el('option', { value: '' }, ['— aggiungi giocatore —']),
     ...attivi.filter(g => !idIscritti.has(g.id)).map(g => el('option', { value: g.id },
      [nomeProfilo(g)]))]);
  blocco.append(el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, [
    selettore,
    el('button', { class: 'btn btn-primary btn-mini', onclick: async () => {
      if (!selettore.value) return;
      try { const r = await iscriviManuale(p.id, selettore.value);
        toast(r === 'lista_attesa' ? 'Iscritto in lista d\'attesa.' : 'Giocatore iscritto.');
        await riempiGestione(p, box, contenuto); return;
      } catch (e) { toast(e.message, 'errore'); }
    }}, ['Iscrivi']),
  ]));

  // Squadre (formazione)
  blocco.append(el('div', { class: 'sezione-titolo' }, [
    `🧢 Squadre (tocca: A→B→C→D→fuori). N=${p.num_squadre || 2} · max/g=${p.giocatori_per_squadra || 5}`]));
  const nSq = Math.max(2, Math.min(4, p.num_squadre || 2));
  const letters = ['A','B','C','D'].slice(0, nSq);
  const colonne = el('div', { class: 'squadre-grid', style: `grid-template-columns:repeat(${nSq},1fr)` });
  for (const lettera of letters) {
    const giocatori = squadre.filter(g => (g.squadra || '').toUpperCase() === lettera);
    const colori = { A:['#e9f2fc','#2273d2'], B:['#f3ebfd','#7a3fd1'],
                     C:['#e7f8ec','#0e7a3d'], D:['#fff1e0','#e05e00'] }[lettera];
    const col = el('div', { style: `background:${colori[0]};border-radius:12px;padding:10px;min-width:0` }, [
      el('div', { style: `font-weight:900;font-size:13px;margin-bottom:6px;color:${colori[1]}` },
        [`SQUADRA ${lettera} (${giocatori.length})`]),
      ...giocatori.map(g => el('div', { class: 'riga', style: 'padding:4px 0;border:none' }, [
        avatar(g, 26),
        el('div', { class: 'riga-testo' }, [
          el('span', { style: 'font-size:13px' }, [nomeProfilo(g)]),
          g.ruolo === 'allenatore' ? el('span', { class: 'badge', style: 'margin-left:6px;font-size:10px' }, ['👔 Allenatore']) : null,
          g.ruolo === 'jolly' ? el('span', { class: 'badge badge-arancio', style: 'margin-left:6px;font-size:10px' }, ['🎭 Jolly']) : null,
        ]),
      ])),
    ]);
    colonne.append(col);
  }
  blocco.append(colonne);
  const chips = el('div', { class: 'elenco-checkbox', style: 'margin-top:8px' });
  if (iscritti.filter(x => !x.in_attesa).length >= 2) {
    for (const g of iscritti.filter(x => !x.in_attesa)) {
      const sqPresenti = squadre.filter(s => s.id === g.id);
      const labelSq = sqPresenti.length
        ? sqPresenti.map(s => `${s.squadra}${s.ruolo === 'jolly' ? '🎭' : s.ruolo === 'allenatore' ? '👔' : ''}`).join('+')
        : '';
      const chip = el('span', { class: 'chip' + (sqPresenti.length ? ' sel' : '') },
        [`${nomeProfilo(g)} ${labelSq ? '(' + labelSq + ')' : ''}`]);
      chip.addEventListener('click', async () => {
        const cur = sqPresenti.length ? sqPresenti[0].squadra : null;
        const idx = cur ? letters.indexOf(cur) : -1;
        const prossima = idx === -1 ? letters[0] : (idx + 1 <= letters.length - 1 ? letters[idx+1] : null);
        await impostaSquadra(p.id, g.id, prossima);
        await riempiGestione(p, box, contenuto);
      });
      chips.append(chip);
    }
  }
  blocco.append(chips);
  blocco.append(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, [
    el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
      try {
        const n = await generaSquadreBilate(p.id);
        toast(`Squadre bilanciate (${n} giocatori).`);
        await riempiGestione(p, box, contenuto); return;
      } catch (e) { toast(e.message, 'errore'); }
    }}, ['⚖️ Genera squadre bilanciate']),
  ]));

  // Jolly
  blocco.append(el('div', { class: 'sezione-titolo' }, ['🎭 Jolly (assegna a più squadre)']));
  const selJolly = el('select', { class: 'input', style: 'min-height:40px;max-width:200px' },
    [el('option', { value: '' }, ['— scegli giocatore —']),
     ...iscritti.filter(x => !x.in_attesa).map(g => el('option', { value: g.id }, [nomeProfilo(g)]))]);
  const cbA = el('input', { type: 'checkbox' }), cbB = el('input', { type: 'checkbox' }),
        cbC = el('input', { type: 'checkbox' }), cbD = el('input', { type: 'checkbox' });
  const cbBox = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px' },
    ['A','B','C','D'].slice(0, nSq).map((l, i) => el('label',
      { style: 'display:flex;gap:4px;align-items:center;font-weight:600' },
      [[cbA, cbB, cbC, cbD][i], ' ' + l])));
  blocco.append(el('div', { class: 'form-riga', style: 'flex-direction:column' }, [
    selJolly, cbBox,
    el('button', { class: 'btn btn-arancio btn-mini', onclick: async (e) => {
      e.target.disabled = true;
      try {
        const id = selJolly.value;
        if (!id) { toast('Scegli prima un giocatore.', 'errore'); e.target.disabled = false; return; }
        const squadreJolly = [cbA, cbB, cbC, cbD].slice(0, nSq)
          .map((cb, i) => cb.checked ? ['A','B','C','D'][i] : null).filter(Boolean);
        if (!squadreJolly.length) {
          await segnaJolly(p.id, id, null);
          toast('Jolly rimosso.');
        } else {
          await segnaJolly(p.id, id, squadreJolly);
          toast(`Jolly assegnato a: ${squadreJolly.join(', ')}.`);
        }
        await riempiGestione(p, box, contenuto); return;
      } catch (err) { toast(err.message, 'errore'); }
      e.target.disabled = false;
    }}, ['💾 Imposta jolly']),
  ]));

  // Allenatore
  blocco.append(el('div', { class: 'sezione-titolo' }, ['👔 Allenatore per squadra']));
  for (const lettera of letters) {
    // FIX: il coach ATTUALMENTE assegnato va letto da squadre/match_ruoli e
    // preselezionato nel menu. Prima la select partiva sempre da "— nessuno —"
    // e il bottone "rimuovi" leggeva l'id da un'opzione che non lo possedeva
    // mai, usando un UUID finto: la rimozione non funzionava per nessuno.
    const coachAttuale = squadre.find(g => (g.squadra || '').toUpperCase() === lettera && g.ruolo === 'allenatore');
    const selAll = el('select', { class: 'input', style: 'min-height:40px' }, [
      el('option', { value: '', ...(!coachAttuale ? { selected: '' } : {}) },
        [`— nessuno allenatore per sq ${lettera} —`]),
      ...attivi.map(g => el('option',
        { value: g.id, ...(coachAttuale?.id === g.id ? { selected: '' } : {}) },
        [nomeProfilo(g)])),
    ]);
    blocco.append(el('div', { class: 'form-riga', style: 'align-items:center' }, [
      el('div', { class: 'campo', style: 'min-width:60px;font-weight:900' }, [`Sq ${lettera}`]),
      selAll,
      el('button', { class: 'btn btn-primary btn-mini', onclick: async (e) => {
        e.target.disabled = true;
        try {
          const nuovoId = selAll.value || null;
          if (coachAttuale && coachAttuale.id !== nuovoId) {
            // rimuove SEMPRE il coach realmente assegnato prima, usando il suo id vero
            await impostaAllenatore(p.id, coachAttuale.id, null);
          }
          if (nuovoId && nuovoId !== coachAttuale?.id) {
            await impostaAllenatore(p.id, nuovoId, lettera);
            toast(`Allenatore Sq ${lettera} impostato.`);
          } else if (!nuovoId && coachAttuale) {
            toast(`Allenatore Sq ${lettera} rimosso.`);
          } else {
            toast('Nessuna modifica.');
          }
          await riempiGestione(p, box, contenuto); return;
        } catch (err) { toast(err.message, 'errore'); }
        e.target.disabled = false;
      }}, ['Salva']),
    ]));
  }

  // MVP candidati
  blocco.append(el('div', { class: 'sezione-titolo' }, ['🌟 MVP — candidati della partita']));
  const candidatiBox = el('div', { class: 'elenco-checkbox' });
  function renderCandidati() {
    candidatiBox.innerHTML = '';
    if (!iscritti.filter(x => !x.in_attesa).length) {
      candidatiBox.append(el('div', { class: 'riga-sub' }, ['Nessun iscritto.']));
      return;
    }
    for (const g of iscritti.filter(x => !x.in_attesa)) {
      const isCand = candidatiMVPList.some(c => c.id === g.id);
      const chip = el('span', { class: 'chip' + (isCand ? ' sel' : ''), style: 'cursor:pointer' }, [
        nomeProfilo(g) + (isCand ? ' ✓' : ''),
      ]);
      chip.addEventListener('click', async () => {
        try {
          const nuovi = isCand
            ? candidatiMVPList.filter(c => c.id !== g.id).map(c => c.id)
            : [...candidatiMVPList.map(c => c.id), g.id];
          await setCandidatiMVP(p.id, nuovi);
          await riempiGestione(p, box, contenuto);
        } catch (err) { toast(err.message, 'errore'); }
      });
      candidatiBox.append(chip);
    }
  }
  renderCandidati(); // FIX: senza questa chiamata i candidati non comparivano mai
  blocco.append(candidatiBox);
  blocco.append(el('div', { class: 'riga-sub', style: 'margin-top:6px' },
    ['Solo i profili marcati "tuttofare" possono poi scegliere uno di questi come MVP.']));

  // Risultato e marcatori
  blocco.append(el('div', { class: 'sezione-titolo' }, ['🏁 Risultato e marcatori']));
  const gA = el('input', { class: 'input', type: 'number', min: 0, max: 99, value: p.gol_squadra_a ?? 0, style: 'min-height:40px' });
  const gB = el('input', { class: 'input', type: 'number', min: 0, max: 99, value: p.gol_squadra_b ?? 0, style: 'min-height:40px' });
  blocco.append(el('div', { class: 'form-riga' }, [
    el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Gol Squadra A']), gA]),
    el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Gol Squadra B']), gB]),
  ]));
  // FIX: gli allenatori non segnano gol — senza l'esclusione comparivano
  // anche loro nella lista marcatori (da quando squadrePartita() li include).
  const schierati = (squadre.length ? squadre : iscritti.filter(g => !g.in_attesa))
    .filter(g => g.ruolo !== 'allenatore');
  const inputGol = new Map(); const inputAuto = new Map();
  for (const g of schierati) {
    const esiste = golEsistenti.get(g.id); // FIX: precompila con i gol già salvati
    const n = el('input', { class: 'input', type: 'number', min: 0, max: 20,
      value: esiste?.gol || 0, style: 'min-height:36px;max-width:70px' });
    const a = el('input', { type: 'checkbox', ...(esiste?.autogol ? { checked: '' } : {}) });
    inputGol.set(g.id, n); inputAuto.set(g.id, a);
    blocco.append(el('div', { class: 'riga', style: 'padding:5px 0' }, [
      avatar(g, 28), el('div', { class: 'riga-testo' }, [
        el('span', { style: 'font-size:14px;font-weight:600' }, [nomeProfilo(g)]),
        el('span', { class: 'badge badge-grigio', style: 'margin-left:6px' }, [g.squadra || '?']),
      ]),
      el('label', { style: 'display:flex;align-items:center;gap:4px;font-size:12px' }, [a, ' autogol']),
      n,
    ]));
  }
  blocco.append(el('button', { class: 'btn btn-arancio btn-blocco', onclick: async (e) => {
    try {
      const marcatori = [];
      let sommaGolA = 0, sommaGolB = 0;         // gol "normali" per squadra
      let sommaAutogolA = 0, sommaAutogolB = 0; // autogol (contano per la squadra AVVERSARIA)
      for (const [id, input] of inputGol) {
        const gol = Number(input.value) || 0;
        const autogolFlag = inputAuto.get(id).checked;
        const g = schierati.find(x => x.id === id);
        const lato = ((g?.squadra || '').toUpperCase() === 'A' || (g?.squadra || '').toUpperCase() === 'C') ? 'A' : 'B';
        if (gol > 0) {
          marcatori.push({ user_id: id, gol, autogol: false });
          if (lato === 'A') sommaGolA += gol; else sommaGolB += gol;
        }
        if (autogolFlag) {
          marcatori.push({ user_id: id, gol: 1, autogol: true });
          if (lato === 'A') sommaAutogolA += 1; else sommaAutogolB += 1;
        }
      }
      // CONTROLLO richiesto: la somma dei gol assegnati ai giocatori deve
      // coincidere col risultato finale (un autogol vale un punto per
      // la squadra AVVERSARIA rispetto a chi lo segna).
      const totaleA = sommaGolA + sommaAutogolB;
      const totaleB = sommaGolB + sommaAutogolA;
      if (totaleA !== Number(gA.value) || totaleB !== Number(gB.value)) {
        const continua = confirm(
          `⚠️ I gol dei singoli giocatori (A: ${totaleA}, B: ${totaleB}) non coincidono ` +
          `con il risultato inserito (A: ${gA.value}, B: ${gB.value}).\n\n` +
          `Salvare comunque?`);
        if (!continua) return;
      }
      e.target.disabled = true;
      await impostaRisultato(p.id, Number(gA.value), Number(gB.value), marcatori);
      toast('Risultato salvato, votazione aperta! ⭐');
      await riempiGestione(p, box, contenuto); return;
    } catch (err) { toast(err.message, 'errore'); }
    e.target.disabled = false;
  }}, [p.stato === 'giocata' ? '💾 Aggiorna risultato e marcatori' : '💾 Salva risultato e APRI votazione']));

  // Votazione
  blocco.append(el('div', { class: 'sezione-titolo' }, ['⭐ Votazione']));
  if (p.stato === 'giocata') {
    blocco.append(el('div', { class: 'riga-sub' }, [
      p.votazione_aperta ? `Aperta — scade: ${fmtScadenza(p.votazione_scadenza)}` : 'Chiusa',
    ]));
    const azioni = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px' });
    for (const [azione, etichetta, cls] of [
      ['apri',   '🔓 Apri',         'btn-ghost'],
      ['chiudi', '🔒 Chiudi ora',   'btn-pericolo'],
      ['riapri', '↻ Riapri',        'btn-ghost']]) {
      azioni.append(el('button', { class: `btn ${cls} btn-mini`, onclick: async () => {
        if (azione === 'chiudi' && !conferma('Chiudere la votazione ADESSO?')) return;
        try { await gestisciVotazione(p.id, azione); toast('Votazione aggiornata.');
          await riempiGestione(p, box, contenuto); return;
        } catch (e) { toast(e.message, 'errore'); }
      }}, [etichetta]));
    }
    blocco.append(azioni);
  } else {
    blocco.append(el('div', { class: 'riga-sub' }, ['La votazione si apre quando salvi il risultato di una partita giocata.']));
  }

  box.innerHTML = '';
  box.append(blocco);
}

/* ================= UTENTI ================= */
async function schedaUtenti(contenuto) {
  const profili = await listaProfili();
  contenuto.innerHTML = '';
  const cerca = el('input', { class: 'input', placeholder: '🔍 Cerca nome o email…', style: 'margin-bottom:12px' });
  const lista = el('div', { class: 'card' });
  contenuto.append(cerca, lista);
  function disegna() {
    const q = cerca.value.toLowerCase();
    lista.innerHTML = '';
    lista.append(el('div', { class: 'card-titolo' }, [`👤 Utenti (${profili.length})`]));
    for (const g of profili.filter(p =>
      !q || (p.nome + ' ' + p.cognome + ' ' + p.soprannome + ' ' + p.email).toLowerCase().includes(q))) {
      lista.append(rigaUtente(g, () => schedaUtenti(contenuto)));
    }
  }
  cerca.addEventListener('input', disegna);
  disegna();
}

function rigaUtente(g, onAggiorna) {
  const dettaglio = el('div', { style: 'display:none;width:100%' });
  const btnMod = el('button', { class: 'btn btn-ghost btn-mini' }, ['Modifica']);
  btnMod.addEventListener('click', () => {
    if (dettaglio.style.display === 'none') { dettaglio.style.display = ''; btnMod.textContent = 'Chiudi'; }
    else { dettaglio.style.display = 'none'; btnMod.textContent = 'Modifica'; }
  });

  const fNome = el('input', { class: 'input', value: g.nome, style: 'min-height:40px' });
  const fCognome = el('input', { class: 'input', value: g.cognome, style: 'min-height:40px' });
  const fSopr = el('input', { class: 'input', value: g.soprannome, style: 'min-height:40px' });
  const fEmail = el('input', { class: 'input', type: 'email', value: g.email, style: 'min-height:40px' });
  const fRuolo = el('select', { class: 'input', style: 'min-height:40px' },
    [['','—'],['portiere','Portiere'],['difensore','Difensore'],
     ['centrocampista','Centrocampista'],['attaccante','Attaccante']]
    .map(([v, t]) => el('option', { value: v, ...(g.ruolo_preferito === v ? { selected: '' } : {}) }, [t])));
  const fPiede = el('select', { class: 'input', style: 'min-height:40px' },
    [['','—'],['destro','Destro'],['sinistro','Sinistro'],['ambidestro','Ambidestro']]
    .map(([v, t]) => el('option', { value: v, ...(g.piede_preferito === v ? { selected: '' } : {}) }, [t])));
  const fFotoUrl = el('input', { class: 'input', value: g.foto_url || '',
    placeholder: 'URL foto (se non usi file picker)', style: 'min-height:40px' });

  // Anteprima + file picker per foto al posto d'altri (admin flow)
  const fotoBox = el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' });
  const avatarAttuale = el('img', { src: g.foto_url || '', class: 'anteprima-foto', alt: 'foto attuale',
    style: 'width:72px;height:72px;border-radius:10px;object-fit:cover;background:#fff;border:2px solid var(--bordo)' });
  fotoBox.append(avatarAttuale, el('span', { class: 'riga-sub' }, ['👆 attuale']));
  const inputFotoAdmin = el('input', { class: 'input', type: 'file',
    accept: 'image/jpeg,image/png,image/webp', style: 'width:220px;padding:6px' });
  inputFotoAdmin.addEventListener('change', () => {
    fotoBox.querySelectorAll('.anteprima-admin-nuova').forEach(n => n.remove());
    if (inputFotoAdmin.files[0]) {
      const a = anteprimaImg(inputFotoAdmin.files[0], 72);
      a.classList.add('anteprima-admin-nuova');
      a.style.borderColor = 'var(--arancio)';
      fotoBox.append(a, el('span', { class: 'riga-sub anteprima-admin-nuova' }, ['👆 nuova']));
    }
  });
  const btnCaricaFotoAdmin = el('button', { class: 'btn btn-arancio btn-mini' },
    ['📷 Carica foto al posto suo']);
  btnCaricaFotoAdmin.addEventListener('click', async (ev) => {
    if (!inputFotoAdmin.files[0]) {
      toast('Seleziona prima un file.', 'errore'); return;
    }
    ev.target.disabled = true;
    try {
      const blobRidim = await ridimensiona(inputFotoAdmin.files[0], 600, 0.85);
      const url = await caricaFoto(g.id, blobRidim);
      await aggiornaProfilo(g.id, { foto_url: url });
      toast('Foto aggiornata per ' + nomeProfilo(g) + ' ✅');
      g.foto_url = url;
      inputFotoAdmin.value = '';
      fFotoUrl.value = url;
      fotoBox.querySelectorAll('.anteprima-admin-nuova').forEach(n => n.remove());
      avatarAttuale.src = url;
    } catch (e) {
      console.error('[admin upload foto]', e);
      toast('Errore: ' + e.message, 'errore');
    }
    ev.target.disabled = false;
  });

  dettaglio.append(el('div', { class: 'admin-blocco' }, [
    el('div', { class: 'form' }, [
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Nome']), fNome]),
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Cognome']), fCognome]),
      ]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Soprannome']), fSopr]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Email']), fEmail]),
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Ruolo']), fRuolo]),
        el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Piede']), fPiede]),
      ]),
      el('div', { class: 'campo' }, [
        el('label',{class:'campo-label'},['📷 Foto (URL o carica file)']),
        fFotoUrl, inputFotoAdmin, fotoBox,
        btnCaricaFotoAdmin,
      ]),
      el('button', { class: 'btn btn-primary btn-mini', onclick: async (e) => {
        e.target.disabled = true;
        try {
          const patch = { nome: fNome.value.trim(), cognome: fCognome.value.trim(),
            soprannome: fSopr.value.trim(), ruolo_preferito: fRuolo.value || null,
            piede_preferito: fPiede.value || null, foto_url: fFotoUrl.value.trim() || null };
          await aggiornaProfilo(g.id, patch);
          if (fEmail.value.trim() !== g.email) await cambiaEmail(g.id, fEmail.value.trim());
          toast('Utente aggiornato.'); Object.assign(g, patch, { email: fEmail.value.trim() });
          e.target.textContent = '✓ Salvato';
        } catch (err) { toast(err.message, 'errore'); }
        e.target.disabled = false;
      }}, ['Salva']),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
          await impostaAttivo(g.id, !g.attivo); toast(g.attivo ? 'Utente disattivato.' : 'Utente riattivato.');
          g.attivo = !g.attivo;
        }}, [g.attivo ? '🚫 Disattiva' : '✅ Riattiva']),
        el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
          const nuova = prompt(`Nuova password per ${nomeProfilo(g)} (min 6 caratteri):`);
          if (!nuova) return;
          try { await resetPassword(g.id, nuova); toast('Password reimpostata.'); }
          catch (err) { toast(err.message, 'errore'); }
        }}, ['🔑 Reset password']),
        el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
          try { await promuoviAdmin(g.id, !g.is_admin);
            toast(g.is_admin ? 'Permessi admin rimossi.' : 'Ora è admin!');
            g.is_admin = !g.is_admin;
          } catch (err) { toast(err.message, 'errore'); }
        }}, [g.is_admin ? '⬇️ Togli admin' : '⬆️ Promuovi admin']),
        el('button', {
          style: `background:${g.is_tuttofare ? '#0e7a3d;color:#fff' : ''};border:none;border-radius:9px;padding:4px 10px;font-size:12px;font-weight:800;cursor:pointer;min-height:32px`,
          onclick: async () => {
            try {
              await setTuttofare(g.id, !g.is_tuttofare);
              toast(g.is_tuttofare ? '"Tuttofare" rimosso.' : 'Ora è "tuttofare"! 🌟');
              g.is_tuttofare = !g.is_tuttofare;
            } catch (err) { toast(err.message, 'errore'); }
          }
        }, [g.is_tuttofare ? '🌟 Tuttofare ✓' : '🌟 Rendi tuttofare']),
        el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
          if (!conferma(`Eliminare DEFINITIVAMENTE ${nomeProfilo(g)} e tutti i suoi dati?`)) return;
          try { await eliminaUtente(g.id); toast('Utente eliminato.');
            if (onAggiorna) onAggiorna();
          } catch (err) { toast(err.message, 'errore'); }
        }}, ['🗑 Elimina']),
      ]),
    ]),
  ]));

  return el('div', {}, [
    el('div', { class: 'riga' }, [
      avatar(g, 36),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [nomeProfilo(g) +
          (g.is_admin ? ' ⭐admin' : '') +
          (g.is_tuttofare ? ' 🌟tuttofare' : '') +
          (g.is_demo ? ' · demo' : '') + (!g.attivo ? ' · disattivo' : '')]),
        el('div', { class: 'riga-sub' }, [g.email]),
      ]),
      btnMod,
    ]),
    dettaglio,
  ]);
}

/* ================= VOTI ================= */
async function schedaVoti(contenuto) {
  const partite = await listaPartite();
  const giocate = partite.filter(p => p.stato === 'giocata').sort((a, b) => b.data.localeCompare(a.data));
  contenuto.innerHTML = '';
  if (!giocate.length) { contenuto.append(el('div', { class: 'card vuoto' }, ['Nessuna partita giocata'])); return; }
  const selettore = el('select', { class: 'input', style: 'margin-bottom:12px' },
    giocate.map(p => el('option', { value: p.id }, [fmtData(p.data) + ` (${p.gol_squadra_a}–${p.gol_squadra_b})`])));
  const box = el('div');
  contenuto.append(el('div', { class: 'card' }, [selettore]), box);

  async function disegna() {
    box.innerHTML = '';
    box.append(spinnerAdmin());
    const voti = await tuttiVoti(selettore.value);
    box.innerHTML = '';
    box.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, [`⭐ ${voti.length} voti registrati (visibili solo a te, con commenti)`]),
      voti.length ? voti.map(v => rigaVotoAdmin(v)) : el('div', { class: 'vuoto' }, ['Nessun voto']),
    ]));
  }

  function rigaVotoAdmin(v) {
    const input = selectVoto(v.voto);
    const commento = el('input', { class: 'input', value: v.commento || '', placeholder: 'Commento', style: 'min-height:36px;font-size:13px' });
    const btnSalva = el('button', { class: 'btn btn-primary btn-mini' }, ['Salva']);
    btnSalva.addEventListener('click', async () => {
      if (!input.value) { toast('Scegli un voto', 'errore'); return; }
      btnSalva.disabled = true;
      try {
        await salvaVotoAdmin(selettore.value, v.votante.id, v.votato.id, input.value, commento.value);
        toast('Voto aggiornato.'); await disegna(); return;
      } catch (e) { toast(e.message, 'errore'); }
      btnSalva.disabled = false;
    });
    return el('div', { class: 'riga' }, [
      avatar(v.votante, 30),
      el('span', { class: 'riga-sub' }, ['→']),
      avatar(v.votato, 30),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo', style: 'font-size:13.5px' },
          [`${nomeProfilo(v.votante)} → ${nomeProfilo(v.votato)}`]),
        commento,
      ]),
      el('div', { style: 'display:flex;flex-direction:column;gap:5px;align-items:stretch' }, [
        input,
        el('div', { style: 'display:flex;gap:4px' }, [
          btnSalva,
          el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
            if (!conferma('Eliminare questo voto?')) return;
            try { await eliminaVoto(v.id); toast('Voto eliminato.'); await disegna(); return; }
            catch (e) { toast(e.message, 'errore'); }
          }}, ['🗑']),
        ]),
      ]),
    ]);
  }

  selettore.addEventListener('change', disegna);
  await disegna();
}

/* ================= IMPOSTAZIONI ================= */
async function schedaImpostazioni(contenuto) {
  const imp = await getImpostazioni();
  contenuto.innerHTML = '';
  const fOre = el('input', { class: 'input', type: 'number', min: 1, max: 720, value: imp.votazione_ore });
  const fMin = el('input', { class: 'input', type: 'number', min: 0, max: 20, value: imp.min_partite_classifica });
  const fPosti = el('input', { class: 'input', type: 'number', min: 4, max: 30, value: imp.posti_default });
  const btn = el('button', { class: 'btn btn-primary btn-blocco' }, ['💾 Salva impostazioni']);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await salvaImpostazioni({ votazione_ore: Number(fOre.value),
        min_partite_classifica: Number(fMin.value), posti_default: Number(fPosti.value) });
      toast('Impostazioni salvate! Le votazioni future useranno questi valori.');
    } catch (e) { toast(e.message, 'errore'); }
    btn.disabled = false;
  });
  contenuto.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['🛠️ Impostazioni generali']),
    el('div', { class: 'form' }, [
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Ore di apertura votazioni']), fOre]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Partite minime per la classifica']), fMin]),
      el('div', { class: 'campo' }, [el('label',{class:'campo-label'},['Posti predefiniti per partita']), fPosti]),
      btn,
    ]),
  ]));

  contenuto.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['🧹 Dati di esempio (demo)']),
    el('div', { class: 'riga-sub' }, ['Elimina in un colpo solo tutte le partite e i profili di prova.']),
    el('button', { class: 'btn btn-pericolo btn-blocco', style: 'margin-top:10px', onclick: async () => {
      if (!conferma('Eliminare TUTTE le partite demo e i profili demo?')) return;
      try { await eliminaDatiDemo(); toast('Dati demo eliminati. ✅'); }
      catch (e) { toast(e.message, 'errore'); }
    }}, ['🗑 Elimina tutti i dati demo']),
  ]));
}
