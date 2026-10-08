// ============================================================================
// Stato dell'applicazione: sessione corrente, profilo, cache dei profili
// ============================================================================
import { sb } from './supabase.js';

export const state = {
  sessione: null,     // sessione Supabase corrente
  profilo: null,      // profilo dell'utente collegato (tabella profiles)
  profili: new Map(), // cache di tutti i profili (id -> profilo) per nomi/avatar
};

/** Ricarica il profilo dell'utente collegato */
export async function caricaProfilo() {
  if (!state.sessione) { state.profilo = null; return null; }
  const { data, error } = await sb.from('profiles')
    .select('*').eq('id', state.sessione.user.id).single();
  if (error) { console.error(error); state.profilo = null; return null; }
  state.profilo = data;
  return data;
}

/** Precarica tutti i profili in cache (per nomi e avatar ovunque nell'app) */
export async function precaricaProfili() {
  const { data } = await sb.from('profiles').select('*').order('nome');
  if (data) for (const p of data) state.profili.set(p.id, p);
}

/** Profilo dalla cache */
export const profiloPerId = (id) => state.profili.get(id);

/** L'utente collegato è admin? */
export const sonoAdmin = () => !!state.profilo?.is_admin;

/** L'utente collegato è admin o cassiere? (può scrivere movimenti di cassa) */
export const sonoCassiere = () => !!state.profilo?.is_admin || !!state.profilo?.is_cassiere;

/** L'utente collegato è admin o tuttofare? (può assegnare la "maglietta più iconica") */
export const sonoAdminOTuttofare = () => !!state.profilo?.is_admin || !!state.profilo?.is_tuttofare;

/** Aggiorna un profilo nella cache (dopo una modifica) */
export function aggiornaCacheProfilo(p) {
  if (p?.id) state.profili.set(p.id, p);
}
