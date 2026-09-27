// ============================================================================
// ⚙️ CONFIGURAZIONE DELL'APP — modifica SOLO questo file per personalizzare
// ============================================================================

// ⬇️ SOSTITUISCI QUESTI DUE VALORI CON QUELLI DEL TUO PROGETTO SUPABASE ⬇️
//    Supabase → Project Settings → API:
//      • Project URL   (es. https://abcdefgh.supabase.co)
//      • anon public key (la chiave che inizia con "eyJhbGciOi…"; MAI la service_role!)
export const SUPABASE_URL = 'https://IL-TUO-PROGETTO.supabase.co';
export const SUPABASE_ANON_KEY = 'INSERISCI-QUI-LA-CHIAVE-ANON';

// Valori predefiniti dell'app (poi modificabili live dall'Area Admin > Impostazioni,
// dove vengono salvati nel database e hanno la precedenza su questi)
export const DEFAULTS = {
  votazioneOre: 48,        // ore di apertura della votazione dopo il risultato
  minPartiteClassifica: 3, // partite minime per comparire in classifica
  postiDefault: 10,        // posti predefiniti per ogni partita
};

// ============================================================================
// Controllo di configurazione: se i segnaposto non sono stati sostituiti,
// mostra un messaggio chiaro invece di una pagina vuota.
// ============================================================================
const NON_CONFIG =
  !SUPABASE_URL || SUPABASE_URL.includes('IL-TUO-PROGETTO') ||
  !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('INSERISCI');

export function verificaConfig(container) {
  if (!NON_CONFIG) return true;
  container.innerHTML = `
    <div style="max-width:560px;margin:60px auto;padding:24px;background:#fff;
                border-radius:16px;box-shadow:0 4px 20px rgba(20,60,40,.12);
                font-family:system-ui;-webkit-font-smoothing:antialiased">
      <div style="font-size:48px;text-align:center;margin-bottom:6px">⚽</div>
      <h1 style="color:#0e7a3d;text-align:center;margin:0 0 12px;font-size:22px">
        Configura Supabase per continuare
      </h1>
      <p style="color:#1c2b22;font-size:15px;line-height:1.5;margin:0 0 14px">
        L'app è stata pubblicata ma <strong>non è ancora collegata</strong> al tuo
        progetto Supabase, quindi non può mostrare la schermata con il pulsante
        <strong>Registrati</strong>.
      </p>
      <ol style="color:#1c2b22;font-size:15px;line-height:1.7;padding-left:20px;margin:0 0 14px">
        <li>Dashboard Supabase → <strong>Project Settings → API</strong></li>
        <li>Copia <strong>Project URL</strong> e la chiave <strong>anon public</strong></li>
        <li>Apri <code>src/config.js</code> sul tuo computer e sostituisci le due righe
            segnaposto con i valori veri</li>
        <li>Trascina di nuovo la cartella su
            <a href="https://app.netlify.com/drop" target="_blank"
               style="color:#0e7a3d;font-weight:700">app.netlify.com/drop</a></li>
      </ol>
      <p style="margin:0;font-size:13px;color:#62736a">
        ⚠️ Dopo il redeploy, premi <strong>Ctrl+Maiusc+R</strong>
        (o <strong>Cmd+Maiusc+R</strong> su Mac) per evitare la cache.
      </p>
    </div>`;
  return false;
}
