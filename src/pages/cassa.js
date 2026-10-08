// ============================================================================
// CASSA — fondo comune: resti raccolti a fine partita, destinati a premi.
// Chiunque può vedere i movimenti (trasparenza); solo admin/cassiere scrivono.
// ============================================================================
import { state, sonoCassiere, sonoAdmin } from '../state.js';
import { listaMovimentiCassa, salvaMovimentoCassa, eliminaMovimentoCassa, listaPartite } from '../api.js';
import { el, fmtData, avatar, nomeProfilo, toast, spinner, vuoto, oggiISO } from '../ui.js';

function conferma(msg) { return window.confirm(msg); }

export async function renderizzaCassa(app) {
  app.append(spinner());
  const puoScrivere = sonoCassiere();
  const [movimenti, profili, partite] = await Promise.all([
    listaMovimentiCassa(),
    [...state.profili.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    listaPartite(),
  ]);
  app.innerHTML = '';

  const totale = movimenti.reduce((s, m) => s + Number(m.importo), 0);

  // Riepilogo per custode (chi tiene fisicamente i soldi in questo momento)
  const perCustode = new Map();
  for (const m of movimenti) {
    const k = m.custode?.id || '_nessuno';
    if (!perCustode.has(k)) perCustode.set(k, { profilo: m.custode, saldo: 0 });
    perCustode.get(k).saldo += Number(m.importo);
  }
  const righeCustode = [...perCustode.values()]
    .filter(c => Math.abs(c.saldo) > 0.004)
    .sort((a, b) => b.saldo - a.saldo);

  app.append(el('div', { class: 'hero' }, [
    el('div', { class: 'hero-etichetta' }, ['💰 Cassa comune']),
    el('div', { class: 'hero-data', style: 'font-size:28px' }, [`${totale.toFixed(2)} €`]),
    el('div', { class: 'hero-luogo' }, ['Resti raccolti a fine partita, destinati a premi']),
  ]));

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['👜 Chi tiene cosa']),
    righeCustode.length
      ? righeCustode.map(c => el('div', { class: 'riga' }, [
          c.profilo ? avatar(c.profilo, 32) : el('span', { style: 'font-size:22px' }, ['❔']),
          el('div', { class: 'riga-testo' }, [
            el('div', { class: 'riga-titolo', style: 'font-size:14px' },
              [c.profilo ? nomeProfilo(c.profilo) : 'Non specificato']),
          ]),
          el('span', { class: 'badge', style: `background:${c.saldo >= 0 ? '#e6f4ea' : '#fdeaea'};color:${c.saldo >= 0 ? 'var(--verde-scuro)' : '#c0392b'}` },
            [`${c.saldo.toFixed(2)} €`]),
        ]))
      : vuoto('Nessun saldo da mostrare.'),
  ]));

  if (puoScrivere) {
    app.append(formNuovoMovimento());
  }

  app.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['📜 Movimenti']),
    movimenti.length ? movimenti.map(m => rigaMovimento(m)) : vuoto('Ancora nessun movimento registrato.'),
  ]));

  function selettorePartita(valoreIniziale) {
    const s = el('select', { class: 'input' }, [
      el('option', { value: '' }, ['— nessuna partita collegata —']),
      ...partite.slice().reverse().map(p => el('option',
        { value: p.id, ...(valoreIniziale === p.id ? { selected: '' } : {}) },
        [fmtData(p.data) + (p.luogo ? ' · ' + p.luogo : '')])),
    ]);
    return s;
  }
  function selettoreCustode(valoreIniziale) {
    const s = el('select', { class: 'input' }, [
      el('option', { value: '' }, ['— nessun custode —']),
      ...profili.map(p => el('option',
        { value: p.id, ...(valoreIniziale === p.id ? { selected: '' } : {}) },
        [nomeProfilo(p)])),
    ]);
    return s;
  }

  function formNuovoMovimento() {
    const fData = el('input', { class: 'input', type: 'date', value: oggiISO() });
    const fImporto = el('input', { class: 'input', type: 'number', step: '0.5', placeholder: 'es. 18 oppure -10' });
    const fDescrizione = el('input', { class: 'input', placeholder: 'es. Resto raccolto, Premio MVP ottobre…' });
    const fCustode = selettoreCustode('');
    const fMatch = selettorePartita('');
    const btn = el('button', { class: 'btn btn-primary btn-mini' }, ['➕ Aggiungi movimento']);
    btn.addEventListener('click', async () => {
      const importo = Number(fImporto.value);
      if (!importo) { toast('Inserisci un importo diverso da zero (negativo per un\'uscita)', 'errore'); return; }
      if (!fDescrizione.value.trim()) { toast('Inserisci una descrizione', 'errore'); return; }
      btn.disabled = true;
      try {
        await salvaMovimentoCassa(null, fData.value, importo, fDescrizione.value.trim(),
          fCustode.value || null, fMatch.value || null);
        toast('Movimento salvato!');
        renderizzaCassa(app);
      } catch (e) { toast(e.message, 'errore'); btn.disabled = false; }
    });
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['✏️ Nuovo movimento']),
      el('div', { class: 'form' }, [
        el('div', { class: 'form-riga' }, [
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Data']), fData]),
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Importo (€, negativo = uscita)']), fImporto]),
        ]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Descrizione']), fDescrizione]),
        el('div', { class: 'form-riga' }, [
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Custode (chi tiene i soldi)']), fCustode]),
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Partita collegata (opzionale)']), fMatch]),
        ]),
        btn,
      ]),
    ]);
  }

  function rigaMovimento(m) {
    const entrata = Number(m.importo) >= 0;
    const dettagli = [
      el('div', { class: 'riga-titolo', style: 'font-size:14px' }, [m.descrizione]),
      el('div', { class: 'riga-sub' }, [
        fmtData(m.data),
        m.custode ? ' · 👜 ' + nomeProfilo(m.custode) : '',
        m.match ? ' · ⚽ ' + fmtData(m.match.data) : '',
      ].join('')),
    ];
    const azioni = [];
    if (puoScrivere) {
      azioni.push(el('button', { class: 'btn btn-ghost btn-mini', onclick: () => apriModifica(m) }, ['✏️']));
    }
    if (sonoAdmin()) {
      azioni.push(el('button', { class: 'btn btn-pericolo btn-mini', onclick: async () => {
        if (!conferma('Eliminare questo movimento?')) return;
        try { await eliminaMovimentoCassa(m.id); toast('Movimento eliminato.'); renderizzaCassa(app); }
        catch (e) { toast(e.message, 'errore'); }
      }}, ['🗑']));
    }
    const riga = el('div', { class: 'riga' }, [
      el('span', { class: 'badge', style: `background:${entrata ? '#e6f4ea' : '#fdeaea'};color:${entrata ? 'var(--verde-scuro)' : '#c0392b'};min-width:70px;text-align:center` },
        [`${entrata ? '+' : ''}${Number(m.importo).toFixed(2)} €`]),
      el('div', { class: 'riga-testo' }, dettagli),
      ...azioni,
    ]);

    function apriModifica(mov) {
      const fData = el('input', { class: 'input', type: 'date', value: mov.data });
      const fImporto = el('input', { class: 'input', type: 'number', step: '0.5', value: mov.importo });
      const fDescrizione = el('input', { class: 'input', value: mov.descrizione });
      const fCustode = selettoreCustode(mov.custode?.id || '');
      const fMatch = selettorePartita(mov.match?.id || '');
      const btnSalva = el('button', { class: 'btn btn-primary btn-mini' }, ['Salva modifiche']);
      btnSalva.addEventListener('click', async () => {
        const importo = Number(fImporto.value);
        if (!importo) { toast('Importo non può essere zero', 'errore'); return; }
        btnSalva.disabled = true;
        try {
          await salvaMovimentoCassa(mov.id, fData.value, importo, fDescrizione.value.trim(),
            fCustode.value || null, fMatch.value || null);
          toast('Movimento aggiornato.');
          renderizzaCassa(app);
        } catch (e) { toast(e.message, 'errore'); btnSalva.disabled = false; }
      });
      const box = el('div', { class: 'card', style: 'border-left:4px solid var(--arancio)' }, [
        el('div', { class: 'form' }, [
          el('div', { class: 'form-riga' }, [
            el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Data']), fData]),
            el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Importo']), fImporto]),
          ]),
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Descrizione']), fDescrizione]),
          el('div', { class: 'form-riga' }, [
            el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Custode']), fCustode]),
            el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Partita collegata']), fMatch]),
          ]),
          btnSalva,
        ]),
      ]);
      riga.replaceWith(box);
    }

    return riga;
  }
}
