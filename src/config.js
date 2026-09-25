// ============================================================================
// ⚙️ CONFIGURAZIONE DELL'APP — modifica SOLO questo file per personalizzare
// ============================================================================

// Credenziali del tuo progetto Supabase (Dashboard > Project Settings > API)
// USA SOLO la chiave "anon public" — mai la service_role!
export const SUPABASE_URL = 'https://vzdyejqpumfytqdgwrsu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZHllanFwdW1meXRxZGd3cnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDYyNjAsImV4cCI6MjEwNTgyMjI2MH0.4UTZtQAl519oPYAM0PzaPiSOVskaJWQC3dVFi1kwcM0';

// Valori predefiniti (poi modificabili dall'Area Admin > Impostazioni,
// dove vengono salvati nel database e hanno la precedenza su questi)
export const DEFAULTS = {
  votazioneOre: 48,        // ore di apertura delle votazioni dopo il risultato
  minPartiteClassifica: 3, // partite minime per comparire in classifica
  postiDefault: 10,        // posti predefiniti per ogni partita
};
