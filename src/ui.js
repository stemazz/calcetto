// ============================================================================
// Utilità di interfaccia: creazione elementi, date, toast, avatar, ecc.
// ============================================================================

/** Crea un elemento DOM: el('div', {class:'card', onclick: fn}, [figli...]) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
              'luglio','agosto','settembre','ottobre','novembre','dicembre'];

/** '2026-03-14' -> 'sab 14 marzo' */
export function fmtData(iso) {
  if (!iso) return '';
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return `${GIORNI[d.getUTCDay()]} ${g} ${MESI[m - 1]}`;
}

/** '2026-03-14' -> 'marzo 2026' */
export function fmtMese(iso) {
  const [, m, a] = iso.split('-').map(Number);
  return `${MESI[m - 1]} ${a}`;
}

/** Oggi in formato ISO locale (aaaa-mm-gg) */
export function oggiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nome visualizzato di un profilo */
export function nomeProfilo(p) {
  if (!p) return '—';
  return p.soprannome || `${p.nome} ${p.cognome}`.trim() || p.nome;
}

/** Iniziali per l'avatar se non c'è la foto */
export function iniziali(p) {
  const n = nomeProfilo(p);
  return n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/** Avatar con foto o iniziali su sfondo verde */
export function avatar(p, size = 40) {
  if (p?.foto_url) {
    return el('img', { class: 'avatar', src: p.foto_url, alt: nomeProfilo(p),
      style: `width:${size}px;height:${size}px` });
  }
  return el('div', { class: 'avatar avatar-iniziali', style: `width:${size}px;height:${size}px;font-size:${size * 0.4}px` },
    [iniziali(p)]);
}

/** Notifica breve in basso */
export function toast(msg, tipo = 'ok') {
  const t = el('div', { class: `toast toast-${tipo}` }, [msg]);
  document.body.append(t);
  setTimeout(() => t.classList.add('visibile'), 10);
  setTimeout(() => { t.classList.remove('visibile'); setTimeout(() => t.remove(), 300); }, 3200);
}

/** Spinner di caricamento */
export function spinner() {
  return el('div', { class: 'spinner' }, ['⏳ Caricamento…']);
}

/** Messaggio di stato vuoto */
export function vuoto(msg) {
  return el('div', { class: 'vuoto' }, [msg]);
}

/** <select> per i voti da 1 a 10 a mezzi punti */
export function selectVoto(valore = '') {
  const s = el('select', { class: 'input select-voto' }, [el('option', { value: '' }, ['— voto —'])]);
  for (let v = 10; v >= 1; v -= 0.5) {
    const label = Number.isInteger(v) ? String(v) : v.toFixed(1);
    s.append(el('option', { value: label, ...(String(valore) === label ? { selected: '' } : {}) }, [label]));
  }
  return s;
}

/** Formatta una scadenza in italiano */
export function fmtScadenza(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
