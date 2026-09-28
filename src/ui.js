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
  for (const c of [].concat(children).flat(Infinity)) { 
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

// ============================================================================
// RIDIMENSIONA immagine via canvas → JPEG (qualità 0.85) max 600×600.
// Risolve due problemi:
//   1) foto troppo pesanti (alcune sono 5-10 MB) → upload più rapido
//   2) PNG/WEBP con alpha channel → convertiti a JPEG uniforme
// Fallback: se canvas fallisce, restituisce il file originale.
// ============================================================================
export async function ridimensiona(fileOrBlob, latoMax = 600, qualita = 0.85) {
  if (!fileOrBlob) throw new Error('file mancante');
  // se l'immagine è già piccola e già JPEG, lasciala passare (ottimizzazione)
  try {
    const bitmap = await createImageBitmap(fileOrBlob);
    const w0 = bitmap.width, h0 = bitmap.height;
    const rapporto = Math.min(1, latoMax / Math.max(w0, h0));
    const w = Math.round(w0 * rapporto), h = Math.round(h0 * rapporto);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    // sfondo bianco per evitare JPEG con bordi neri (da PNG con alpha)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob vuoto')), 'image/jpeg', qualita);
    });
    const sizeKb = Math.round(blob.size / 1024);
    console.log(`[ridimensiona] ${w0}×${h0} → ${w}×${h} (${sizeKb} KB)`);
    return new File([blob], (fileOrBlob.name || 'foto') + '.jpg', { type: 'image/jpeg' });
  } catch (err) {
    console.warn('[ridimensiona] canvas fallito, passo il file originale:', err);
    if (fileOrBlob instanceof Blob && fileOrBlob.type) return fileOrBlob;
    throw err;
  }
}

/** Anteprima locale di un file immagine da URL.createObjectURL */
export function anteprimaImg(file, size = 90) {
  if (!file) return null;
  const url = URL.createObjectURL(file);
  return el('img', { src: url, alt: 'anteprima', class: 'anteprima-foto',
    style: `width:${size}px;height:${size}px;object-fit:cover;border-radius:10px;
            border:2px solid var(--verde);margin-top:6px;background:#fff`,
    onload: () => setTimeout(() => URL.revokeObjectURL(url), 30000) });
}
