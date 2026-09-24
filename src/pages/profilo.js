// ============================================================================
// PROFILO — dati personali, foto, storico, statistiche individuali, password
// ============================================================================
import { state, profiloPerId, aggiornaCacheProfilo } from '../state.js';
import {
  aggiornaProfilo, caricaFoto, statisticheGlobali, andamentoVoti,
  nuovaPassword, mieIscrizioni, listaPartite,
} from '../api.js';
import { el, avatar, nomeProfilo, toast, spinner, vuoto, fmtData, fmtMese } from '../ui.js';

export async function renderizzaProfilo(app, profiloId, soloPassword = false) {
  const mioId = state.sessione.user.id;
  const id = profiloId || mioId;
  const mioProfilo = id === mioId;

  // Reimpostazione password (da link email o dalla pagina profilo)
  if (soloPassword) {
    const p1 = el('input', { class: 'input', type: 'password', placeholder: 'Nuova password (min 6 caratteri)' });
    const btn = el('button', { class: 'btn btn-primary btn-blocco' }, ['Salva nuova password']);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await nuovaPassword(p1.value); toast('Password aggiornata! Ora accedi.'); location.hash = '#/home'; }
      catch (e) { toast(e.message, 'errore'); btn.disabled = false; }
    });
    app.innerHTML = '';
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['🔒 Imposta una nuova password']), p1, btn,
    ]));
    return;
  }

  app.append(spinner());
  const [stats, andamento] = await Promise.all([
    statisticheGlobali(), andamentoVoti(id),
  ]);
  const s = stats.find(x => x.giocatore_id === id);
  const p = profiloPerId(id) || (s ? { ...s, id: s.giocatore_id } : null);
  app.innerHTML = '';
  if (!p) { app.append(vuoto('Profilo non trovato')); return; }

  // Intestazione profilo
  app.append(el('div', { class: 'hero', style: 'display:flex;align-items:center;gap:14px' }, [
    avatar(p, 58),
    el('div', {}, [
      el('div', { class: 'hero-data', style: 'font-size:22px' }, [nomeProfilo(p)]),
      el('div', { class: 'hero-luogo' }, [p.ruolo_preferito || 'ruolo libero']),
    ]),
  ]));

  // Statistiche individuali
  if (s) {
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['📊 Statistiche']),
      el('div', { class: 'stat-grid' }, [
        statBox(Number(s.media_voti).toFixed(2), 'media voti'),
        statBox(s.gol, 'gol'),
        statBox(s.presenze, 'presenze'),
        statBox(s.vittorie, 'vittorie'),
        statBox(s.pareggi, 'pareggi'),
        statBox(s.sconfitte, 'sconfitte'),
      ]),
    ]));

    // Grafico andamento voti
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['📈 Andamento voti nel tempo']),
      andamento.length
        ? el('div', { style: 'display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:6px' },
            andamento.map(v => el('a', {
              href: `#/partita/${v.match_id}`, style: 'flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;text-decoration:none',
              title: `${fmtData(v.data)}: ${Number(v.media_voto).toFixed(1)}`,
            }, [
              el('div', { style: 'font-size:10px;font-weight:800;color:var(--verde-scuro)' }, [Number(v.media_voto).toFixed(1)]),
              el('div', { style: `width:100%;max-width:34px;height:${Math.round((v.media_voto / 10) * 100)}%;background:linear-gradient(180deg,var(--verde),var(--verde-scuro));border-radius:6px 6px 0 0` }),
            ])))
        : vuoto('Ancora nessun voto ricevuto.'),
    ]));
  }

  // Modifica dati (solo il proprio profilo)
  if (mioProfilo) {
    const f = (valore, tipo = 'text', ph = '') =>
      el('input', { class: 'input', type: tipo, value: valore ?? '', placeholder: ph });
    const nome = f(p.nome), cognome = f(p.cognome), soprannome = f(p.soprannome, 'text', 'es. "Pippero"');
    const ruolo = el('select', { class: 'input' }, [
      ['','ruolo preferito…'], ['portiere','Portiere'], ['difensore','Difensore'],
      ['centrocampista','Centrocampista'], ['attaccante','Attaccante'],
    ].map(([v, t]) => el('option', { value: v, ...(p.ruolo_preferito === v ? { selected: '' } : {}) }, [t])));
    const piede = el('select', { class: 'input' }, [
      ['','piede preferito (facoltativo)'], ['destro','Destro'], ['sinistro','Sinistro'], ['ambidestro','Ambidestro'],
    ].map(([v, t]) => el('option', { value: v, ...(p.piede_preferito === v ? { selected: '' } : {}) }, [t])));
    const foto = el('input', { class: 'input', type: 'file', accept: 'image/*', style: 'padding:8px' });

    const btn = el('button', { class: 'btn btn-primary btn-blocco' }, ['💾 Salva profilo']);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const patch = { nome: nome.value.trim(), cognome: cognome.value.trim(),
          soprannome: soprannome.value.trim(),
          ruolo_preferito: ruolo.value || null, piede_preferito: piede.value || null };
        if (foto.files[0]) patch.foto_url = await caricaFoto(id, foto.files[0]);
        await aggiornaProfilo(id, patch);
        await aggiornaCacheProfilo({ ...p, ...patch });
        toast('Profilo aggiornato! ✅');
        renderizzaProfilo(app, null);
        return;
      } catch (e) { toast(e.message, 'errore'); }
      btn.disabled = false;
    });

    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['✏️ Modifica i tuoi dati']),
      el('div', { class: 'form' }, [
        el('div', { class: 'form-riga' }, [
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Nome']), nome]),
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Cognome']), cognome]),
        ]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Soprannome']), soprannome]),
        el('div', { class: 'form-riga' }, [
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Ruolo']), ruolo]),
          el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Piede']), piede]),
        ]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Foto profilo']), foto]),
        btn,
      ]),
    ]));

    // Cambio password volontario
    app.append(el('div', { class: 'card' }, [
      el('div', { class: 'card-titolo' }, ['🔒 Password']),
      el('a', { class: 'btn btn-ghost btn-blocco', href: '#/reimposta' }, ['Cambia la mia password']),
    ]));
  }
}

function statBox(valore, etichetta) {
  return el('div', { class: 'stat-box' }, [
    el('div', { class: 'stat-valore' }, [String(valore)]),
    el('div', { class: 'stat-etichetta' }, [etichetta]),
  ]);
}
