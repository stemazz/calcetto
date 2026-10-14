// ============================================================================
// ROUTER + AVVIO — gestisce navigazione, sessione, menu e notifiche
// ============================================================================
import { sb } from './supabase.js';
import { verificaConfig } from './config.js';
import { state, caricaProfilo, precaricaProfili, sonoAdmin } from './state.js';
import { el } from './ui.js';
import { aggiornaStatoVotazioni } from './api.js';
import { renderizzaAuth } from './pages/auth.js';
import { renderizzaHome } from './pages/home.js';
import { renderizzaCalendario } from './pages/calendario.js';
import { renderizzaDettaglio } from './pages/dettaglio.js';
import { renderizzaVoti } from './pages/voti.js';
import { renderizzaStatistiche } from './pages/statistiche.js';
import { renderizzaConfronto } from './pages/confronto.js';
import { renderizzaCassa } from './pages/cassa.js';
import { renderizzaProfilo } from './pages/profilo.js';
import { renderizzaAdmin } from './pages/admin.js';

const app = document.getElementById('app');
const header = document.getElementById('header');
const nav = document.getElementById('bottom-nav');

// FIX RECUPERO PASSWORD: il link che Supabase manda per email, dopo la
// verifica, reindirizza al nostro redirectTo (#/reimposta) MA aggiungendo
// il token di sessione nello stesso "#" che il nostro router usa per le
// rotte — il risultato è qualcosa come "#/reimposta&access_token=...
// &type=recovery...". Il parsing normale di instrada() qui sotto si
// aspetta "pagina" o "pagina/parametro" e non riconosce questa stringa,
// finendo nel caso "default" che rimanda tutti a Home: la sessione di
// recupero viene creata correttamente, ma l'utente non vede MAI la
// schermata per scegliere la nuova password — sembra che "non succeda
// niente" cliccando il link dell'email.
// La soluzione: leggere l'hash SUBITO, prima che qualunque cosa lo
// modifichi, e usarlo per forzare la rotta "reimposta" una volta sola.
let recuperoPasswordInCorso = location.hash.includes('type=recovery');

document.getElementById('btn-esci').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.hash = '';
  location.reload();
});
document.getElementById('btn-admin').addEventListener('click', () => { location.hash = '#/admin'; });

/** Mostra/nasconde header e menu in base al login */
function mostraNav(mostra) {
  // Prima nascondo MENO se non è ancora stata verificata la config
  if (!verificaConfig(app)) return;
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
  if (!verificaConfig(app)) return;
  if (!state.sessione) { mostraNav(false); renderizzaAuth(app); return; }
  mostraNav(true);
  document.getElementById('btn-admin').hidden = !sonoAdmin();
  let route;
  if (recuperoPasswordInCorso) {
    // Si consuma una volta sola: non deve bloccare la navigazione normale
    // dopo che l'utente ha impostato la nuova password.
    recuperoPasswordInCorso = false;
    route = 'reimposta';
    // Pulisce la barra degli indirizzi dal token (non deve restare visibile
    // né rischiare di essere riusato), senza ricaricare la pagina.
    history.replaceState(null, '', location.pathname + '#/reimposta');
  } else {
    route = (location.hash.replace(/^#\//, '') || 'home');
  }
  const [pagina, parametro] = route.split('/');
  app.innerHTML = '';
  try {
    switch (pagina) {
      case 'home':        await renderizzaHome(app); break;
      case 'calendario':  await renderizzaCalendario(app); break;
      case 'partita':     await renderizzaDettaglio(app, parametro); break;
      case 'voti':        await renderizzaVoti(app, parametro); break;
      case 'statistiche': await renderizzaStatistiche(app, parametro); break;
      case 'confronto':   await renderizzaConfronto(app); break;
      case 'cassa':       await renderizzaCassa(app); break;
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
  if (!verificaConfig(app)) return; // blocca l'app con un messaggio chiaro
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
