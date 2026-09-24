// ============================================================================
// AREA ADMIN — gestione completa: partite, utenti, voti, impostazioni.
// Tutte le operazioni sono protette lato database (RLS): anche manipolando
// l'interfaccia, un non-admin non può eseguire queste azioni.
// ============================================================================
import { state, profiloPerId } from '../state.js';
import {
  listaPartite, creaPartita, modificaPartita, eliminaPartita,
  iscrittiPartita, iscriviManuale, rimuoviDaPartita,
  squadrePartita, impostaSquadra, generaSquadreBilate,
  impostaRisultato, gestisciVotazione,
  tuttiVoti, eliminaVoto, salvaVotoAdmin,
  listaProfili, aggiornaProfilo, impostaAttivo, resetPassword, cambiaEmail,
  promuoviAdmin, eliminaUtente, eliminaDatiDemo,
  getImpostazioni, salvaImpostazioni,
} from '../api.js';
import {
  el, avatar, nomeProfilo, toast, fmtData, fmtScadenza, oggiISO, selectVoto,
} from '../ui.js';

export async function renderizzaAdmin(app) {
  app.innerHTML = '';
  app.append(el('h2', { style: 'margin:4px 0 12px;font-size:20px' }, ['⚙️ Area Admin']));

  const schede = [['partite', '📅 Partite'], ['utenti', '👤 Utenti'], ['voti', '⭐ Voti'], ['impostazioni', '🛠️ Impostazioni']];
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

// ============================================================================
// SCHEDA PARTITE: creazione, modifica, annullamento, iscrizioni, squadre,
// risultato+marcatori, apertura/chiusura votazioni.
// ============================================================================
async function schedaPartite(contenuto) {
  const partite = await listaPartite();
  contenuto.innerHTML = '';

  // ---- Form nuova partita ----
  const fData = el('input', { class: 'input', type: 'date', value: oggiISO() });
  const fOra = el('input', { class: 'input', type: 'time', value: '19:00' });
  const fLuogo = el('input', { class: 'input', placeholder: 'Campo / luogo' });
  const fPosti = el('input', { class: 'input', type: 'number', min: 4, max: 30, value: 10 });
  const btnNuova = el('button', { class: 'btn btn-primary btn-blocco' }, ['➕ Crea partita']);
  btnNuova.addEventListener('click', async () => {
    btnNuova.disabled = true;
    try {
      await creaPartita({ data: fData.value, ora: fOra.value, luogo: fLuogo.value.trim(),
        max_giocatori: Number(fPosti.value) });
      toast('Partita creata! 📅'); await schedaPartite(contenuto); return;
    } catch (e) { toast(e.message, 'errore'); }
    btnNuova.disabled = false;
  });
  contenuto.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['➕ Nuova partita']),
    el('div', { class: 'form' }, [
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Data']), fData]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Ora']), fOra]),
      ]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Luogo']), fLuogo]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Posti massimi']), fPosti]),
      btnNuova,
    ]),
  ]));

  // ---- Elenco partite (gestione espandibile) ----
  const ordinate = [...partite].sort((a, b) => b.data.localeCompare(a.data));
  contenuto.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['📋 Gestione partite']),
    ordinate.length ? ordinate.map(p => rigaGestionePartita(p, contenuto)) : el('div', { class: 'vuoto' }, ['Nessuna partita']),
  ]));
}

function rigaGestionePartita(p, contenuto) {
  const badge = { programmata: el('span', { class: 'badge' }, ['Programmata']),
    giocata: el('span', { class: 'badge badge-blu' }, ['Giocata']),
    annullata: el('span', { class: 'badge badge-rosso' }, ['Annullata']) }[p.stato];
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
        el('div', { class: 'riga-sub' }, [p.luogo || '—']),
      ]),
      badge, apri,
    ]),
    dettaglio,
  ]);
}

async function riempiGestione(p, box, contenuto) {
  const [iscritti, squadre] = await Promise.all([iscrittiPartita(p.id), squadrePartita(p.id)]);
  box.innerHTML = '';
  const blocco = el('div', { class: 'admin-blocco' });

  // ---- Modifica dati partita ----
  const eData = el('input', { class: 'input', type: 'date', value: p.data });
  const eOra = el('input', { class: 'input', type: 'time', value: p.ora.slice(0, 5) });
  const eLuogo = el('input', { class: 'input', value: p.luogo });
  const ePosti = el('input', { class: 'input', type: 'number', min: 4, max: 30, value: p.max_giocatori });
  blocco.append(el('div', { class: 'sezione-titolo' }, ['✏️ Dati partita']));
  blocco.append(el('div', { class: 'form' }, [
    el('div', { class: 'form-riga' }, [
      el('div', { class: 'campo' }, [eData]), el('div', { class: 'campo' }, [eOra]),
    ]),
    el('div', { class: 'form-riga' }, [
      el('div', { class: 'campo' }, [eLuogo]), el('div', { class: 'campo' }, [ePosti]),
    ]),
    el('button', { class: 'btn btn-primary btn-mini', onclick: async (e) => {
      e.target.disabled = true;
      try {
        await modificaPartita(p.id, { data: eData.value, ora: eOra.value,
          luogo: eLuogo.value.trim(), max_giocatori: Number(ePosti.value) });
        toast('Partita aggiornata.'); await riempiGestione(p, box, contenuto); return;
      } catch (err) { toast(err.message, 'errore'); }
      e.target.disabled = false;
    } }, ['Salva dati']),
  ]));

  // ---- Stato partita ----
  blocco.append(el('div', { class: 'sezione-titolo' }, ['🚦 Stato']));
  const stati = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
  if (p.stato !== 'annullata') stati.append(el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
    if (!conferma('Annullare questa partita?')) return;
    await modificaPartita(p.id, { stato: 'annullata' }); toast('Partita annullata.'); await riempiGestione(p, box, contenuto);
  } }, ['❌ Annulla partita']));
  if (p.stato === 'annullata') stati.append(el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
    await modificaPartita(p.id, { stato: 'programmata' }); toast('Partita riattivata.'); await riempiGestione(p, box, contenuto);
  } }, ['♻️ Riattiva']));
  stati.append(el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
    if (!conferma('Eliminare DEFINITIVAMENTE la partita e tutti i suoi dati?')) return;
    await eliminaPartita(p.id); toast('Partita eliminata.');
    await schedaPartite(contenuto); // ricarica l'elenco
  } }, ['🗑 Elimina']));
  blocco.append(stati);

  // ---- Iscrizioni manuali ----
  blocco.append(el('div', { class: 'sezione-titolo' }, [`👥 Iscritti (${iscritti.filter(g => !g.in_attesa).length}/${p.max_giocatori})`]));
  const tutti = await listaProfili();
  const attivi = tutti.filter(g => g.attivo);
  const idIscritti = new Set(iscritti.map(g => g.id));
  blocco.append(iscritti.map(g => el('div', { class: 'riga' }, [
    avatar(g, 30), el('div', { class: 'riga-testo' }, [
      el('div', { class: 'riga-titolo', style: 'font-size:14px' }, [nomeProfilo(g)]),
      g.in_attesa ? el('div', { class: 'riga-sub' }, ['in lista d\'attesa']) : null,
    ]),
    el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
      await rimuoviDaPartita(p.id, g.id); toast('Giocatore rimosso.');
      await riempiGestione(p, box, contenuto);
    } }, ['Rimuovi']),
  ])));
  const selettore = el('select', { class: 'input', style: 'min-height:40px' },
    [el('option', { value: '' }, ['— aggiungi giocatore —']),
     ...attivi.filter(g => !idIscritti.has(g.id)).map(g => el('option', { value: g.id }, [nomeProfilo(g)]))]);
  blocco.append(el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, [
    selettore,
    el('button', { class: 'btn btn-primary btn-mini', onclick: async () => {
      if (!selettore.value) return;
      try { const r = await iscriviManuale(p.id, selettore.value);
        toast(r === 'lista_attesa' ? 'Iscritto in lista d\'attesa.' : 'Giocatore iscritto.');
        await riempiGestione(p, box, contenuto); return;
      } catch (e) { toast(e.message, 'errore'); }
    } }, ['Iscrivi']),
  ]));

  // ---- Squadre ----
  if (iscritti.filter(g => !g.in_attesa).length >= 2) {
    blocco.append(el('div', { class: 'sezione-titolo' }, ['🧢 Squadre (tocca un giocatore: A → B → fuori)']));
    const griglia = el('div', { class: 'squadre-grid' });
    const colonna = (lettera, titolo, cls) => {
      const c = el('div', { class: 'squadra-col ' + cls }, [el('div', { class: 'squadra-nome' }, [titolo])]);
      for (const g of iscritti.filter(x => !x.in_attesa)) {
        const sq = squadre.find(s => s.id === g.id)?.squadra;
        if (sq !== lettera) continue;
        c.append(el('div', { class: 'riga', style: 'padding:4px 0;border:none' }, [avatar(g, 26), el('span', { style: 'font-size:13px' }, [nomeProfilo(g)])]));
      }
      return c;
    };
    griglia.append(colonna('A', 'SQUADRA A', 'squadra-a'), colonna('B', 'SQUADRA B', 'squadra-b'));
    blocco.append(griglia);
    const chips = el('div', { class: 'elenco-checkbox', style: 'margin-top:8px' });
    for (const g of iscritti.filter(x => !x.in_attesa)) {
      const sq = squadre.find(s => s.id === g.id)?.squadra || '';
      const chip = el('span', { class: 'chip' + (sq ? ' sel' : '') },
        [`${nomeProfilo(g)} ${sq ? '(' + sq + ')' : ''}`]);
      chip.addEventListener('click', async () => {
        const nuova = sq === '' ? 'A' : sq === 'A' ? 'B' : null;
        await impostaSquadra(p.id, g.id, nuova);
        await riempiGestione(p, box, contenuto);
      });
      chips.append(chip);
    }
    blocco.append(chips);
    blocco.append(el('button', { class: 'btn btn-ghost btn-blocco', style: 'margin-top:8px', onclick: async () => {
      try { const n = await generaSquadreBilate(p.id); toast(`Squadre bilanciate generate (${n} giocatori).`);
        await riempiGestione(p, box, contenuto); return;
      } catch (e) { toast(e.message, 'errore'); }
    } }, ['⚖️ Genera squadre bilanciate']));
  }

  // ---- Risultato e marcatori ----
  blocco.append(el('div', { class: 'sezione-titolo' }, ['🏁 Risultato e marcatori']));
  const gA = el('input', { class: 'input', type: 'number', min: 0, max: 99, value: p.gol_squadra_a ?? 0, style: 'min-height:40px' });
  const gB = el('input', { class: 'input', type: 'number', min: 0, max: 99, value: p.gol_squadra_b ?? 0, style: 'min-height:40px' });
  blocco.append(el('div', { class: 'form-riga' }, [
    el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Gol Squadra A']), gA]),
    el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Gol Squadra B']), gB]),
  ]));
  const schierati = squadre.length ? squadre : iscritti.filter(g => !g.in_attesa);
  const inputGol = new Map(); const inputAuto = new Map();
  for (const g of schierati) {
    const n = el('input', { class: 'input', type: 'number', min: 0, max: 20, value: 0, style: 'min-height:36px;max-width:70px' });
    const a = el('input', { type: 'checkbox' });
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
    e.target.disabled = true;
    try {
      const marcatori = [];
      for (const [id, input] of inputGol) {
        const gol = Number(input.value) || 0;
        const auto = inputAuto.get(id).checked ? 1 : 0;
        if (gol > 0) marcatori.push({ user_id: id, gol, autogol: false });
        if (auto > 0) marcatori.push({ user_id: id, gol: auto, autogol: true });
      }
      await impostaRisultato(p.id, Number(gA.value), Number(gB.value), marcatori);
      toast('Risultato salvato, votazione aperta! ⭐');
      await riempiGestione(p, box, contenuto); return;
    } catch (err) { toast(err.message, 'errore'); }
    e.target.disabled = false;
  } }, ['💾 Salva risultato e APRI votazione']));

  // ---- Gestione votazione ----
  blocco.append(el('div', { class: 'sezione-titolo' }, ['⭐ Votazione']));
  if (p.stato === 'giocata') {
    blocco.append(el('div', { class: 'riga-sub' }, [
      p.votazione_aperta ? `Aperta — scade: ${fmtScadenza(p.votazione_scadenza)}` : 'Chiusa',
    ]));
    const azioni = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px' });
    for (const [azione, etichetta, cls] of [
      ['apri', '🔓 Apri', 'btn-ghost'], ['chiudi', '🔒 Chiudi', 'btn-pericolo'], ['riapri', '↻ Riapri', 'btn-ghost']]) {
      azioni.append(el('button', { class: `btn ${cls} btn-mini`, onclick: async () => {
        try { await gestisciVotazione(p.id, azione); toast('Votazione aggiornata.');
          await riempiGestione(p, box, contenuto); return;
        } catch (e) { toast(e.message, 'errore'); }
      } }, [etichetta]));
    }
    blocco.append(azioni);
  } else {
    blocco.append(el('div', { class: 'riga-sub' }, ['La votazione si apre quando salvi il risultato di una partita giocata.']));
  }

  box.innerHTML = '';
  box.append(blocco);
}

// ============================================================================
// SCHEDA UTENTI: ricerca, modifica, disattivazione, reset password, admin, eliminazione
// ============================================================================
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
  const dettaglio = el('div', { style: 'display:none', width: '100%' });
  const btnMod = el('button', { class: 'btn btn-ghost btn-mini' }, ['Modifica']);
  btnMod.addEventListener('click', () => {
    if (dettaglio.style.display === 'none') { dettaglio.style.display = ''; btnMod.textContent = 'Chiudi'; }
    else { dettaglio.style.display = 'none'; btnMod.textContent = 'Modifica'; }
  });

  // Form di modifica inline
  const fNome = el('input', { class: 'input', value: g.nome, style: 'min-height:40px' });
  const fCognome = el('input', { class: 'input', value: g.cognome, style: 'min-height:40px' });
  const fSopr = el('input', { class: 'input', value: g.soprannome, style: 'min-height:40px' });
  const fEmail = el('input', { class: 'input', type: 'email', value: g.email, style: 'min-height:40px' });
  const fRuolo = el('select', { class: 'input', style: 'min-height:40px' },
    [['', '—'], ['portiere', 'Portiere'], ['difensore', 'Difensore'],
     ['centrocampista', 'Centrocampista'], ['attaccante', 'Attaccante']]
    .map(([v, t]) => el('option', { value: v, ...(g.ruolo_preferito === v ? { selected: '' } : {}) }, [t])));
  const fPiede = el('select', { class: 'input', style: 'min-height:40px' },
    [['', '—'], ['destro', 'Destro'], ['sinistro', 'Sinistro'], ['ambidestro', 'Ambidestro']]
    .map(([v, t]) => el('option', { value: v, ...(g.piede_preferito === v ? { selected: '' } : {}) }, [t])));
  const fFoto = el('input', { class: 'input', value: g.foto_url || '', placeholder: 'URL foto', style: 'min-height:40px' });

  dettaglio.append(el('div', { class: 'admin-blocco' }, [
    el('div', { class: 'form' }, [
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Nome']), fNome]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Cognome']), fCognome]),
      ]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Soprannome']), fSopr]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Email']), fEmail]),
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Ruolo']), fRuolo]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Piede']), fPiede]),
      ]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Foto (URL)']), fFoto]),
      el('button', { class: 'btn btn-primary btn-mini', onclick: async (e) => {
        e.target.disabled = true;
        try {
          const patch = { nome: fNome.value.trim(), cognome: fCognome.value.trim(),
            soprannome: fSopr.value.trim(), ruolo_preferito: fRuolo.value || null,
            piede_preferito: fPiede.value || null, foto_url: fFoto.value.trim() || null };
          await aggiornaProfilo(g.id, patch);
          if (fEmail.value.trim() !== g.email) await cambiaEmail(g.id, fEmail.value.trim());
          toast('Utente aggiornato.'); Object.assign(g, patch, { email: fEmail.value.trim() });
          e.target.textContent = '✓ Salvato';
        } catch (err) { toast(err.message, 'errore'); }
        e.target.disabled = false;
      } }, ['Salva']),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
          await impostaAttivo(g.id, !g.attivo); toast(g.attivo ? 'Utente disattivato.' : 'Utente riattivato.');
          g.attivo = !g.attivo;
        } }, [g.attivo ? '🚫 Disattiva' : '✅ Riattiva']),
        el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
          const nuova = prompt(`Nuova password per ${nomeProfilo(g)} (min 6 caratteri):`);
          if (!nuova) return;
          try { await resetPassword(g.id, nuova); toast('Password reimpostata.'); }
          catch (err) { toast(err.message, 'errore'); }
        } }, ['🔑 Reset password']),
        el('button', { class: 'btn btn-ghost btn-mini', onclick: async () => {
          try { await promuoviAdmin(g.id, !g.is_admin);
            toast(g.is_admin ? 'Permessi admin rimossi.' : 'Ora è admin!');
            g.is_admin = !g.is_admin;
          } catch (err) { toast(err.message, 'errore'); }
        } }, [g.is_admin ? '⬇️ Togli admin' : '⬆️ Promuovi admin']),
        el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
          if (!conferma(`Eliminare DEFINITIVAMENTE ${nomeProfilo(g)} e tutti i suoi dati?`)) return;
          try { await eliminaUtente(g.id); toast('Utente eliminato.');
            if (onAggiorna) onAggiorna();
          } catch (err) { toast(err.message, 'errore'); }
        } }, ['🗑 Elimina']),
      ]),
    ]),
  ]));

  return el('div', {}, [
    el('div', { class: 'riga' }, [
      avatar(g, 36),
      el('div', { class: 'riga-testo' }, [
        el('div', { class: 'riga-titolo' }, [nomeProfilo(g) +
          (g.is_admin ? ' ⭐admin' : '') + (g.is_demo ? ' · demo' : '') + (!g.attivo ? ' · disattivo' : '')]),
        el('div', { class: 'riga-sub' }, [g.email]),
      ]),
      btnMod,
    ]),
    dettaglio,
  ]);
}

// ============================================================================
// SCHEDA VOTI: tutti i voti di una partita, modificabili ed eliminabili
// ============================================================================
async function schedaVoti(contenuto) {
  const [partite] = await Promise.all([listaPartite()]);
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
      el('div', { class: 'card-titolo' }, [`⭐ ${voti.length} voti registrati (visibili solo a te)`]),
      voti.length ? voti.map(v => rigaVotoAdmin(v)) : el('div', { class: 'vuoto' }, ['Nessun voto']),
    ]));
  }

  function rigaVotoAdmin(v) {
    const input = selectVoto(v.voto);
    const commento = el('input', { class: 'input', value: v.commento, placeholder: 'Commento', style: 'min-height:36px;font-size:13px' });
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
          } }, ['🗑']),
        ]),
      ]),
    ]);
  }

  selettore.addEventListener('change', disegna);
  await disegna();
}

// ============================================================================
// SCHEDA IMPOSTAZIONI: parametri globali + pulizia dati demo
// ============================================================================
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
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Ore di apertura votazioni']), fOre]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Partite minime per la classifica']), fMin]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Posti predefiniti per partita']), fPosti]),
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
    } }, ['🗑 Elimina tutti i dati demo']),
  ]));
}
