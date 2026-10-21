// ============================================================================
// CALENDARIO — vista mensile + lista partite, con iscrizione rapida
// ============================================================================
import { state } from '../state.js';
import {
  listaPartite, iscriviti, cancellati, mieIscrizioni, iscrittiPartita, tutteLeFotoPartite,
} from '../api.js';
import {
  el, fmtData, fmtMese, toast, spinner, vuoto, oggiISO,
} from '../ui.js';

const FOTO_PER_PAGINA = 12;

const NOMI_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
              'luglio','agosto','settembre','ottobre','novembre','dicembre'];

export async function renderizzaCalendario(app) {
  app.append(spinner());
  const userId = state.sessione.user.id;
  const [partite, mie, foto] = await Promise.all([
    listaPartite(), mieIscrizioni(userId), tutteLeFotoPartite().catch(() => []),
  ]);
  app.innerHTML = '';
  app.append(el('h2', { style: 'margin:4px 0 12px;font-size:20px' }, ['📅 Calendario']));

  // Vista mensile (mese corrente, navigabile)
  const oggi = new Date();
  let anno = oggi.getFullYear(), mese = oggi.getMonth();
  const contCal = el('div');
  app.append(contCal);

  function disegnaCalendario() {
    contCal.innerHTML = '';
    const primo = new Date(anno, mese, 1);
    const start = (primo.getDay() + 6) % 7; // lunedì = 0
    const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
    const iso = (g) => `${anno}-${String(mese + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    const partitePerGiorno = new Map(partite.map(p => [p.data, p]));
    const oggiStr = oggiISO();

    const celle = [NOMI_GIORNI.map(n => el('div', { class: 'cal-giorno-nome' }, [n]))];
    for (let i = 0; i < start; i++) celle.push(el('div', { class: 'cal-cell', style: 'background:transparent' }));
    for (let g = 1; g <= giorniNelMese; g++) {
      const d = iso(g);
      const cella = el('div', {
        class: 'cal-cell' + (partitePerGiorno.has(d) ? ' cal-ha-partita' : '') + (d === oggiStr ? ' cal-oggi' : ''),
        title: partitePerGiorno.get(d)?.luogo || '',
      }, [String(g)]);
      const p = partitePerGiorno.get(d);
      if (p) cella.addEventListener('click', () => { location.hash = `#/partita/${p.id}`; });
      celle.push(cella);
    }
    contCal.append(el('div', { class: 'card' }, [
      el('div', { class: 'cal-intestazione' }, [
        el('button', { class: 'btn btn-ghost btn-mini', onclick: () => { mese--; if (mese < 0) { mese = 11; anno--; } disegnaCalendario(); } }, ['‹']),
        el('div', { class: 'cal-mese-nome' }, [`${MESI[mese]} ${anno}`]),
        el('button', { class: 'btn btn-ghost btn-mini', onclick: () => { mese++; if (mese > 11) { mese = 0; anno++; } disegnaCalendario(); } }, ['›']),
      ]),
      el('div', { class: 'cal-griglia' }, celle),
    ]));
  }
  disegnaCalendario();

  // Lista completa: future e passate
  const oggiStr = oggiISO();
  const future = partite.filter(p => p.data >= oggiStr && p.stato !== 'annullata');
  const passate = partite.filter(p => p.data < oggiStr || p.stato !== 'programmata')
    .filter(p => !future.includes(p)).sort((a, b) => b.data.localeCompare(a.data));

  app.append(sezionePartite('🔜 Prossime partite', future, mie, userId));
  app.append(sezionePartite('🕓 Partite passate', passate, mie, userId));
  if (foto.length) app.append(sezioneFoto(foto));
}

/** Galleria di tutte le foto di tutte le partite, senza dover entrare in
 *  ciascuna singolarmente. Mostra le più recenti, con "Vedi altre" per
 *  caricarne a blocchi se diventano tante. Il tocco sulla foto apre
 *  l'originale; l'etichetta sotto porta al dettaglio della partita. */
function sezioneFoto(foto) {
  let visibili = FOTO_PER_PAGINA;
  const griglia = el('div', { class: 'foto-partita-grid' });
  const contAltre = el('div');

  function disegnaGriglia() {
    griglia.innerHTML = '';
    griglia.append(...foto.slice(0, visibili).map(f => el('div', {}, [
      el('div', { class: 'foto-partita-cella' }, [
        el('a', { href: f.url, target: '_blank', rel: 'noopener' }, [
          el('img', { class: 'foto-partita-img', src: f.url, loading: 'lazy' }),
        ]),
      ]),
      el('a', {
        class: 'riga-sub', style: 'display:block;text-align:center;margin-top:4px;text-decoration:none',
        href: `#/partita/${f.match_id}`,
      }, [f.matches?.data ? fmtData(f.matches.data) : '']),
    ])));
    contAltre.innerHTML = '';
    if (visibili < foto.length) {
      contAltre.append(el('button', {
        class: 'btn btn-ghost btn-mini', style: 'margin-top:10px',
        onclick: () => { visibili += FOTO_PER_PAGINA; disegnaGriglia(); },
      }, [`Vedi altre (${foto.length - visibili} rimanenti)`]));
    }
  }
  disegnaGriglia();

  return el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, ['📷 Foto delle partite']),
    griglia,
    contAltre,
  ]);
}

function sezionePartite(titolo, lista, mie, userId) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'card-titolo' }, [titolo]),
    lista.length ? lista.map(p => rigaPartita(p, mie, userId)) : vuoto('Nessuna partita'),
  ]);
}

function rigaPartita(p, mie, userId) {
  const btn = el('button', { class: 'btn btn-mini ' + (mie[p.id] ? 'btn-ghost' : 'btn-arancio') },
    [mie[p.id] === 'iscritto' ? '✓ Annulla' : mie[p.id] === 'attesa' ? '⏳ Esci' : 'Iscriviti']);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (mie[p.id]) { await cancellati(p.id); toast('Iscrizione annullata.'); }
      else {
        const r = await iscriviti(p.id);
        toast(r === 'lista_attesa' ? 'Posti esauriti: sei in lista d\'attesa.' : 'Iscrizione confermata! 💪');
      }
      location.reload();
      return;
    } catch (e) { toast(e.message, 'errore'); btn.disabled = false; }
  });

  return el('div', { class: 'riga' }, [
    el('div', { class: 'riga-testo' }, [
      el('div', { class: 'riga-titolo' }, [fmtData(p.data) + ' · ' + p.ora.slice(0, 5)]),
      el('div', { class: 'riga-sub' }, [
        p.stato === 'annullata' ? '❌ Annullata' : p.luogo || '—',
        // FIX: con 3+ squadre senza sfida diretta A-B questi campi sono null
        // (i risultati veri sono nel dettaglio partita) — niente più "null–null"
        p.stato === 'giocata'
          ? (p.gol_squadra_a !== null ? ` · ${p.gol_squadra_a}–${p.gol_squadra_b}` : ' · risultato in dettaglio')
          : '',
      ]),
    ]),
    p.stato === 'programmata' ? btn : null,
    el('a', { class: 'btn btn-ghost btn-mini', href: `#/partita/${p.id}` }, ['→']),
  ]);
}
