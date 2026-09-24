// ============================================================================
// ROUTER + AVVIO — gestisce navigazione, sessione, menu e notifiche
// ============================================================================
import { sb } from './supabase.js';
import { state, caricaProfilo, precaricaProfili, sonoAdmin } from './state.js';
import { el } from './ui.js';
import { aggiornaStatoVotazioni } from './api.js';
import { renderizzaAuth } from './pages/auth.js';
import { renderizzaHome } from './pages/home.js';
import { renderizzaCalendario } from './pages/calendario.js';
import { renderizzaDettaglio } from './pages/dettaglio.js';
import { renderizzaVoti } from './pages/voti.js';
import { renderizzaStatistiche } from './pages/statistiche.js';
import { renderizzaProfilo } from './pages/profilo.js';
import { renderizzaAdmin } from './pages/admin.js';

const app = document.getElementById('app');
const header = document.getElementById('header');
const nav = document.getElementById('bottom-nav');

document.getElementById('btn-esci').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.hash = '';
  location.reload();
});
document.getElementById('btn-admin').addEventListener('click', () => { location.hash = '#/admin'; });

/** Mostra/nasconde header e menu in base al login */
function mostraNav(mostra) {
  header.hidden = !mostra;
  nav.hidden = !mostra;
}

/** Evidenzia la voce attiva del menu */
function evidenziaNav(pagina) {
  for (const a of nav.querySelectorAll('.nav-item')) {
    const attiva = a.dataset.nav === pagina ||
      (a.dataset.nav === 'voti' && pagina === 'partita');
    a.classList.toggle('attiva', attiva);
  }
}

/** Punto esclamazione sul menu Voti se ci sono votazioni da completare */
export async function aggiornaNotifica() {
  const link = nav.querySelector('[data-nav="voti"]');
  link.classList.remove('con-notifica');
  if (!state.sessione) return;
  try {
    const { data } = await sb.from('matches')
      .select('id').eq('stato', 'giocata').eq('votazione_aperta', true);
    if (!data?.length) return;
    const userId = state.sessione.user.id;
    for (const p of data) {
      const sq = await sb.from('squadre').select('squadra, giocatore_id').eq('match_id', p.id);
      const mia = sq.data?.find(g => g.giocatore_id === userId);
      if (!mia) continue;
      const miei = await sb.from('votes').select('votato_id')
        .eq('match_id', p.id).eq('votante_id', userId);
      const giaVotati = new Set((miei.data || []).map(v => v.votato_id));
      const mancanti = (sq.data || []).filter(g => g.squadra !== mia.squadra && !giaVotati.has(g.giocatore_id));
      if (mancanti.length) { link.classList.add('con-notifica'); return; }
    }
  } catch { /* silenzioso */ }
}

/** Instrada l'URL corrente (#/pagina/parametro) alla pagina giusta */
async function instrada() {
  if (!state.sessione) { mostraNav(false); renderizzaAuth(app); return; }
  mostraNav(true);
  document.getElementById('btn-admin').hidden = !sonoAdmin();
  const route = (location.hash.replace(/^#\//, '') || 'home');
  const [pagina, parametro] = route.split('/');
  app.innerHTML = '';
  try {
    switch (pagina) {
      case 'home':        await renderizzaHome(app); break;
      case 'calendario':  await renderizzaCalendario(app); break;
      case 'partita':     await renderizzaDettaglio(app, parametro); break;
      case 'voti':        await renderizzaVoti(app, parametro); break;
      case 'statistiche': await renderizzaStatistiche(app, parametro); break;
      case 'profilo':     await renderizzaProfilo(app, parametro); break;
      case 'reimposta':   await renderizzaProfilo(app, null, true); break; // nuova password
      case 'admin':       if (sonoAdmin()) await renderizzaAdmin(app, parametro);
                          else location.hash = '#/home';
                          break;
      default:            location.hash = '#/home'; return;
    }
  } catch (e) {
    app.innerHTML = '';
    app.append(el('div', { class: 'card vuoto' }, ['⚠️ ' + (e.message || e)]));
  }
  evidenziaNav(pagina);
  aggiornaNotifica();
  window.scrollTo(0, 0);
}

/** Avvio dell'applicazione */
async function avvia() {
  const { data: { session } } = await sb.auth.getSession();
  state.sessione = session;
  if (session) {
    await caricaProfilo();
    await precaricaProfili();
    await aggiornaStatoVotazioni().catch(() => {}); // chiude votazioni scadute
  }
  sb.auth.onAuthStateChange((_evento, sessione) => {
    if (_evento === 'SIGNED_OUT') { state.sessione = null; state.profilo = null; instrada(); }
  });
  window.addEventListener('hashchange', instrada);
  instrada();
}

avvia();
