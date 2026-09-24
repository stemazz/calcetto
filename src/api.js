// ============================================================================
// LIVELLO DATI — tutte le chiamate al backend Supabase concentrate qui.
// Le regole di sicurezza (chi può fare cosa) vivono nel database (RLS / RPC),
// qui ci sono solo le chiamate e la traduzione degli errori in italiano.
// ============================================================================
import { sb } from './supabase.js';

/** Esegue una RPC (funzione del database) e converte l'errore in eccezione */
async function rpc(nome, args) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(messaggio(error));
  return data;
}

/** Traduce gli errori comuni in italiano */
export function messaggio(e) {
  const m = e?.message || String(e);
  if (/duplicate key/i.test(m)) return 'Email già registrata.';
  if (/failed to fetch/i.test(m)) return 'Connessione assente: riprova.';
  if (/Invalid login/i.test(m)) return 'Email o password non corretti.';
  if (/row-level security|permission denied/i.test(m)) return 'Operazione non consentita.';
  if (/Password should be at least/i.test(m)) return 'Password troppo corta (minimo 6 caratteri).';
  return m;
}

// ----------------------------- IMPOSTAZIONI --------------------------------
export async function getImpostazioni() {
  const { data, error } = await sb.from('impostazioni').select('*').eq('id', 1).single();
  if (error) throw new Error(messaggio(error));
  return data; // { votazione_ore, min_partite_classifica, posti_default }
}
export async function salvaImpostazioni(patch) {
  const { error } = await sb.from('impostazioni').update(patch).eq('id', 1);
  if (error) throw new Error(messaggio(error));
}

// -------------------------------- PARTITE ----------------------------------
export async function listaPartite() {
  const { data, error } = await sb.from('matches').select('*').order('data', { ascending: true });
  if (error) throw new Error(messaggio(error));
  return data;
}
export async function singolaPartita(id) {
  const { data, error } = await sb.from('matches').select('*').eq('id', id).single();
  if (error) throw new Error(messaggio(error));
  return data;
}
export async function creaPartita(p) {
  const { data, error } = await sb.from('matches').insert(p).select().single();
  if (error) throw new Error(messaggio(error));
  return data;
}
export async function modificaPartita(id, patch) {
  const { error } = await sb.from('matches').update(patch).eq('id', id);
  if (error) throw new Error(messaggio(error));
}
export async function eliminaPartita(id) {
  const { error } = await sb.from('matches').delete().eq('id', id);
  if (error) throw new Error(messaggio(error));
}

// ------------------------------- ISCRIZIONI --------------------------------
/** Iscritti a una partita (profilo + flag lista d'attesa), ordine di iscrizione */
export async function iscrittiPartita(matchId) {
  const { data, error } = await sb.from('match_registrations')
    .select('in_attesa, profilo:profiles(*)')
    .eq('match_id', matchId).order('created_at');
  if (error) throw new Error(messaggio(error));
  return data.map(r => ({ ...r.profilo, in_attesa: r.in_attesa }));
}
export const iscriviti = (matchId) => rpc('iscriviti_partita', { p_match: matchId });
export const cancellati = (matchId) => rpc('cancellati_partita', { p_match: matchId });
export const iscriviManuale = (matchId, userId) => rpc('iscrivi_manuale', { p_match: matchId, p_user: userId });
export const rimuoviDaPartita = (matchId, userId) => rpc('rimuovi_da_partita', { p_match: matchId, p_user: userId });

/** Le mie iscrizioni: mappa matchId -> 'iscritto' | 'attesa' */
export async function mieIscrizioni(userId) {
  const { data, error } = await sb.from('match_registrations')
    .select('match_id, in_attesa').eq('user_id', userId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries(data.map(r => [r.match_id, r.in_attesa ? 'attesa' : 'iscritto']));
}

// -------------------------------- SQUADRE ----------------------------------
export async function squadrePartita(matchId) {
  const { data, error } = await sb.from('squadre')
    .select('squadra, profilo:profiles(*)').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return data.map(r => ({ ...r.profilo, squadra: r.squadra }));
}
export const generaSquadreBilate = (matchId) => rpc('genera_squadre_bilate', { p_match: matchId });
/** Assegna un giocatore a una squadra ('A'/'B') o lo rimuove (squadra = null) */
export async function impostaSquadra(matchId, userId, squadra) {
  if (squadra) {
    const { error } = await sb.from('squadre')
      .upsert({ match_id: matchId, giocatore_id: userId, squadra },
              { onConflict: 'match_id,giocatore_id' });
    if (error) throw new Error(messaggio(error));
  } else {
    const { error } = await sb.from('squadre')
      .delete().eq('match_id', matchId).eq('giocatore_id', userId);
    if (error) throw new Error(messaggio(error));
  }
}

// ---------------------------------- GOL ------------------------------------
/** Marcatori raggruppati: [{ id, profilo, gol, autogol }] */
export async function marcatoriPartita(matchId) {
  const { data, error } = await sb.from('goals')
    .select('autogol, profilo:profiles(*)').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  const mappa = new Map();
  for (const g of data) {
    const k = g.profilo.id;
    if (!mappa.has(k)) mappa.set(k, { id: k, profilo: g.profilo, gol: 0, autogol: 0 });
    g.autogol ? mappa.get(k).autogol++ : mappa.get(k).gol++;
  }
  return [...mappa.values()];
}
/** Admin: risultato + marcatori (jsonb) e apertura automatica della votazione */
export const impostaRisultato = (matchId, golA, golB, marcatori) =>
  rpc('imposta_risultato', { p_match: matchId, p_gol_a: golA, p_gol_b: golB, p_marcatori: marcatori });

// ---------------------------------- VOTI -----------------------------------
/** I MIEI voti in una partita: mappa votato_id -> { voto, commento } */
export async function mieiVoti(matchId, userId) {
  const { data, error } = await sb.from('votes')
    .select('votato_id, voto, commento').eq('match_id', matchId).eq('votante_id', userId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries(data.map(v => [v.votato_id, v]));
}
/** Medie voti per giocatore in una partita (vista pubblica e anonima) */
export async function medieVotiPartita(matchId) {
  const { data, error } = await sb.from('vista_voti_per_partita')
    .select('votato_id, media_voto, num_voti').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries(data.map(v => [v.votato_id, v]));
}
export const salvaVoto = (matchId, votatoId, voto, commento) =>
  rpc('salva_voto', { p_match: matchId, p_votato: votatoId, p_voto: voto, p_commento: commento });
export const gestisciVotazione = (matchId, azione) =>
  rpc('gestisci_votazione', { p_match: matchId, p_azione: azione });
export const aggiornaStatoVotazioni = () => rpc('aggiorna_stato_votazioni', {});

// --- SOLO ADMIN (l'RLS mostra questi dati solo agli admin) ------------------
/** Tutti i voti di una partita con nome di chi ha votato e di chi è stato votato */
export async function tuttiVoti(matchId) {
  const { data, error } = await sb.from('votes').select(`
    id, voto, commento,
    votante:profiles!votes_votante_id_fkey(id, nome, cognome, soprannome, foto_url),
    votato:profiles!votes_votato_id_fkey(id, nome, cognome, soprannome, foto_url)
  `).eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return data;
}
export async function eliminaVoto(id) {
  const { error } = await sb.from('votes').delete().eq('id', id);
  if (error) throw new Error(messaggio(error));
}
/** Admin: inserisce o corregge un voto (upsert sulla triple chiave) */
export async function salvaVotoAdmin(matchId, votanteId, votatoId, voto, commento) {
  const { error } = await sb.from('votes')
    .upsert({ match_id: matchId, votante_id: votanteId, votato_id: votatoId,
              voto, commento: commento || '' },
            { onConflict: 'match_id,votante_id,votato_id' });
  if (error) throw new Error(messaggio(error));
}

// ------------------------------ STATISTICHE --------------------------------
/** Statistiche aggregate di tutti i giocatori (vista del database) */
export async function statisticheGlobali() {
  const { data, error } = await sb.from('vista_statistiche_giocatore')
    .select('*').order('media_voti', { ascending: false, nullsFirst: false });
  if (error) throw new Error(messaggio(error));
  return data;
}
/** MVP (posizione 1) di ogni partita giocata, dalla più recente */
export async function listaMVP() {
  const { data, error } = await sb.from('vista_mvp_partita')
    .select('*').eq('pos', 1).order('data', { ascending: false });
  if (error) throw new Error(messaggio(error));
  return data;
}
/** Andamento dei voti ricevuti da un giocatore, partita per partita */
export async function andamentoVoti(userId) {
  const { data, error } = await sb.from('vista_voti_per_partita')
    .select('match_id, data, media_voto, num_voti').eq('votato_id', userId)
    .order('data', { ascending: true });
  if (error) throw new Error(messaggio(error));
  return data;
}

// --------------------------------- PROFILI ---------------------------------
export async function listaProfili() {
  const { data, error } = await sb.from('profiles').select('*').order('nome');
  if (error) throw new Error(messaggio(error));
  return data;
}
/** Aggiorna un profilo: ognuno il proprio, l'admin chiunque (garantito dall'RLS) */
export async function aggiornaProfilo(id, patch) {
  const { error } = await sb.from('profiles').update(patch).eq('id', id);
  if (error) throw new Error(messaggio(error));
}
export const impostaAttivo = (id, attivo) => aggiornaProfilo(id, { attivo });
export const resetPassword = (userId, nuova) => rpc('reset_password', { p_user: userId, p_nuova: nuova });
export const cambiaEmail = (userId, email) => rpc('cambia_email', { p_user: userId, p_email: email });
export const promuoviAdmin = (userId, admin) => rpc('promuovi_admin', { p_user: userId, p_admin: admin });
export const eliminaUtente = (userId) => rpc('elimina_utente', { p_user: userId });
export const eliminaDatiDemo = () => rpc('elimina_dati_demo', {});

// ---------------------------------- AUTH -----------------------------------
export async function registra(email, password, meta) {
  const { error } = await sb.auth.signUp({ email, password, options: { data: meta } });
  if (error) throw new Error(messaggio(error));
}
export async function accedi(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(messaggio(error));
}
export async function esci() { await sb.auth.signOut(); }
export async function recuperaPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email,
    { redirectTo: location.origin + location.pathname + '#/reimposta' });
  if (error) throw new Error(messaggio(error));
}
export async function nuovaPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(messaggio(error));
}

// -------------------------------- FOTO -------------------------------------
/** Carica la foto profilo nel bucket pubblico e restituisce l'URL */
export async function caricaFoto(userId, file) {
  const percorso = `${userId}/foto-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('foto-profili').upload(percorso, file,
    { upsert: true, cacheControl: '0' });
  if (error) throw new Error(messaggio(error));
  const { data } = sb.storage.from('foto-profili').getPublicUrl(percorso);
  return `${data.publicUrl}?v=${Date.now()}`; // parametro anti-cache
}
