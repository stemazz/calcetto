// ============================================================================
// API — tutte le chiamate al backend Supabase.
// ============================================================================
import { sb } from './supabase.js';

async function rpc(nome, args) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(messaggio(error));
  return data;
}

/** Messaggio italiano, MA mostra l'errore reale in console per debug */
export function messaggio(e) {
  const reale = e?.message || e?.error?.message || (typeof e === 'string' ? e : JSON.stringify(e));
  // log sempre l'errore completo in console per diagnostica
  if (typeof console !== 'undefined') console.error('[calcetto] errore Supabase:', e);
  const m = String(reale || '');
  if (/duplicate key|already registered/i.test(m)) return 'Email già registrata.';
  if (/failed to fetch/i.test(m)) return 'Connessione assente: riprova.';
  if (/Invalid login/i.test(m)) return 'Email o password non corretti.';
  if (/row-level security|permission denied/i.test(m)) return 'Operazione non consentita: ' + m;
  if (/Password should be at least/i.test(m)) return 'Password troppo corta (minimo 6 caratteri).';
  if (/Bucket .* not found/i.test(m)) return 'Bucket foto non configurato.';
  if (/new row violates row-level security/i.test(m)) return 'RLS negato: ' + m;
  if (/Payload too large|max upload size|file size/i.test(m)) return 'File troppo grande.';
  if (/mime type|invalid image/i.test(m)) return 'Tipo di file non supportato.';
  return reale;
}

// ----------------------------- IMPOSTAZIONI --------------------------------
export async function getImpostazioni() {
  const { data, error } = await sb.from('impostazioni').select('*').eq('id', 1).single();
  if (error) throw new Error(messaggio(error));
  return data;
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
export async function iscrittiPartita(matchId) {
  const { data, error } = await sb.from('match_registrations')
    .select('in_attesa, profilo:profiles(*)').eq('match_id', matchId).order('created_at');
  if (error) throw new Error(messaggio(error));
  return data.map(r => ({ ...r.profilo, in_attesa: r.in_attesa }));
}
export const iscriviti = (matchId) => rpc('iscriviti_partita', { p_match: matchId });
export const cancellati = (matchId) => rpc('cancellati_partita', { p_match: matchId });
export const iscriviManuale = (matchId, userId) => rpc('iscrivi_manuale', { p_match: matchId, p_user: userId });
export const rimuoviDaPartita = (matchId, userId) => rpc('rimuovi_da_partita', { p_match: matchId, p_user: userId });
export async function mieIscrizioni(userId) {
  const { data, error } = await sb.from('match_registrations')
    .select('match_id, in_attesa').eq('user_id', userId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries(data.map(r => [r.match_id, r.in_attesa ? 'attesa' : 'iscritto']));
}

// -------------------------------- SQUADRE ----------------------------------
export async function squadrePartita(matchId) {
  const [{ data: sq }, { data: mr }] = await Promise.all([
    sb.from('squadre').select('giocatore_id, squadra, profilo:profiles(*)').eq('match_id', matchId),
    sb.from('match_ruoli').select('giocatore_id, squadra, ruolo_partita, profilo:profiles(*)').eq('match_id', matchId),
  ]);
  const ruoloMappa = new Map();
  for (const r of mr || []) ruoloMappa.set(`${r.giocatore_id}|${r.squadra}`, r.ruolo_partita);

  const risultato = (sq || []).map(r => ({
    ...r.profilo, id: r.profilo.id,
    squadra: r.squadra,
    ruolo: ruoloMappa.get(`${r.giocatore_id}|${r.squadra}`) || 'giocatore',
  }));

  // FIX: gli allenatori vengono assegnati SOLO in match_ruoli (mai schierati
  // come giocatori in "squadre"), quindi senza questo passaggio non
  // comparivano né nella formazione né tra i votabili/votanti — sembravano
  // "non salvati" anche se in realtà il salvataggio era andato a buon fine.
  const giaPresenti = new Set(risultato.map(r => `${r.id}|${r.squadra}`));
  for (const r of mr || []) {
    if (r.ruolo_partita !== 'allenatore') continue;
    const chiave = `${r.giocatore_id}|${r.squadra}`;
    if (giaPresenti.has(chiave)) continue;
    risultato.push({ ...r.profilo, id: r.profilo.id, squadra: r.squadra, ruolo: 'allenatore' });
    giaPresenti.add(chiave);
  }
  return risultato;
}
export const generaSquadreBilate = (matchId) => rpc('genera_squadre_bilate', { p_match: matchId });
export const impostaSquadra = (matchId, userId, sq) =>
  rpc('imposta_squadra', { p_match: matchId, p_user: userId, p_squadra: sq });
export const impostaAllenatore = (matchId, userId, sq) =>
  rpc('imposta_allenatore', { p_match: matchId, p_user: userId, p_squadra: sq });
export const segnaJolly = (matchId, userId, squadre) =>
  rpc('segna_jolly', { p_match: matchId, p_user: userId, p_squadre: squadre });

// ---------------------------------- GOL ------------------------------------
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
export const impostaRisultato = (matchId, golA, golB, marcatori) =>
  rpc('imposta_risultato', { p_match: matchId, p_gol_a: golA, p_gol_b: golB, p_marcatori: marcatori });

/** Tutti i risultati a coppie di una partita (uno per 2 squadre, fino a 6 per 4) */
export async function risultatiPartita(matchId) {
  const { data, error } = await sb.from('risultati_coppie')
    .select('squadra_a, squadra_b, gol_a, gol_b').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return data || [];
}
/** Admin: N risultati a coppie + marcatori (jsonb) e apertura automatica della votazione.
 *  Usata per partite con 3 o più squadre; funziona anche con 2 (un solo risultato A-B). */
export const impostaRisultati = (matchId, risultati, marcatori) =>
  rpc('imposta_risultati', { p_match: matchId, p_risultati: risultati, p_marcatori: marcatori });

// ---------------------------------- VOTI -----------------------------------
export async function mieiVoti(matchId, userId) {
  const { data, error } = await sb.from('votes')
    .select('votato_id, voto, commento').eq('match_id', matchId).eq('votante_id', userId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries(data.map(v => [v.votato_id, v]));
}
export async function medieVotiPartita(matchId) {
  const { data, error } = await sb.from('vista_voti_per_partita')
    .select('votato_id, media_voto, num_voti').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries(data.map(v => [v.votato_id, v]));
}
export async function votiConCommentiPartita(matchId) {
  const { data, error } = await sb.from('vista_voti_con_commenti')
    .select('votato_id, num_voti, media_voto, commenti_anonimi').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return Object.fromEntries((data || []).map(v => [v.votato_id, v]));
}
export const salvaVoto = (matchId, votatoId, voto, commento) =>
  rpc('salva_voto', { p_match: matchId, p_votato: votatoId, p_voto: voto, p_commento: commento });
export const gestisciVotazione = (matchId, azione) =>
  rpc('gestisci_votazione', { p_match: matchId, p_azione: azione });
export const chiudiVotazioneOra = (matchId) => gestisciVotazione(matchId, 'chiudi');
export const aggiornaStatoVotazioni = () => rpc('aggiorna_stato_votazioni', {});

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
export async function salvaVotoAdmin(matchId, votanteId, votatoId, voto, commento) {
  const { error } = await sb.from('votes')
    .upsert({ match_id: matchId, votante_id: votanteId, votato_id: votatoId,
              voto, commento: commento || '' },
            { onConflict: 'match_id,votante_id,votato_id' });
  if (error) throw new Error(messaggio(error));
}

// ---------------------------------- MVP ------------------------------------
export const setTuttofare = (userId, val) =>
  rpc('set_tuttofare', { p_user: userId, p_val: val });
export const salvaMVP = (matchId, candidatoId) =>
  rpc('salva_mvp', { p_match: matchId, p_candidato: candidatoId });
export async function candidatiMVP(matchId) {
  const { data, error } = await sb.from('mvp_candidates')
    .select('giocatore_id, profilo:profiles(*)').eq('match_id', matchId);
  if (error) throw new Error(messaggio(error));
  return (data || []).map(d => ({ ...d.profilo, id: d.giocatore_id }));
}
export async function setCandidatiMVP(matchId, ids) {
  const { error: e1 } = await sb.from('mvp_candidates').delete().eq('match_id', matchId);
  if (e1) throw new Error(messaggio(e1));
  if (!ids?.length) return;
  const { error } = await sb.from('mvp_candidates')
    .insert(ids.map(gid => ({ match_id: matchId, giocatore_id: gid })));
  if (error) throw new Error(messaggio(error));
}
export async function risultatoMVP(matchId) {
  const { data, error } = await sb.from('vista_mvp_risultato')
    .select('candidato_id, num_voti_mvp, nome, cognome, soprannome, foto_url')
    .eq('match_id', matchId).order('num_voti_mvp', { ascending: false }).limit(5);
  if (error) throw new Error(messaggio(error));
  return data;
}
export async function mioMVPScelto(matchId, userId) {
  const { data, error } = await sb.from('mvp_votes')
    .select('candidato_id').eq('match_id', matchId).eq('votante_id', userId).maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(messaggio(error));
  return data?.candidato_id || null;
}

// ------------------------------ STATISTICHE --------------------------------
export async function statisticheGlobali() {
  const { data, error } = await sb.from('vista_statistiche_giocatore')
    .select('*').order('media_voti', { ascending: false, nullsFirst: false });
  if (error) throw new Error(messaggio(error));
  return data;
}
export async function listaMVP() {
  const { data, error } = await sb.from('vista_mvp_partita')
    .select('*').eq('pos', 1).order('data', { ascending: false });
  if (error) throw new Error(messaggio(error));
  return data;
}
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

// ============================================================================
// FOTO PROFILO — uso di upload diretto + canvas resize in src/ui.js (ridimensiona).
// IMPORTANTISSIMO:
//   • path = "{userIdTarget}/foto-{timestamp}.jpg"   mai upsert
//   • contentType  = image/jpeg
//   • bucket       = "foto-profili" (deve esistere, con policy I/U/D scritte)
//   • l'utente può scrivere solo nella propria cartella, oppure essere admin
//     (vedere migration-v5.sql → foto_upload/foto_update/foto_delete).
// ============================================================================
export async function caricaFoto(userIdTarget, fileOrBlob) {
  if (!userIdTarget) throw new Error('userId mancante');
  if (!fileOrBlob) throw new Error('file mancante');
  const bucketId = 'foto-profili';
  // nome file: cartella = userId TARGET (non l'utente loggato, utile per admin)
  const percorso = `${userIdTarget}/foto-${Date.now()}.jpg`;
  console.log('[caricaFoto] → upload', { bucketId, percorso, size: fileOrBlob.size, type: fileOrBlob.type });
  const { data, error } = await sb.storage.from(bucketId).upload(percorso, fileOrBlob, {
    upsert: false,
    cacheControl: '3600',
    contentType: 'image/jpeg',
  });
  if (error) {
    // mostro l'errore reale per capire SUBITO quale policy manca
    console.error('[caricaFoto] errore Supabase:', error);
    throw new Error(messaggio(error));
  }
  console.log('[caricaFoto] OK', data);
  const { data: pub } = sb.storage.from(bucketId).getPublicUrl(percorso);
  return `${pub.publicUrl}?v=${Date.now()}`;
}
