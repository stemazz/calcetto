# ⚽ Calcetto tra Amici — Guida di installazione e pubblicazione

Web app mobile-first per organizzare il calcetto: iscrizioni, votazioni, statistiche.
Stack: **Supabase** (database + autenticazione + storage, piano gratuito) + front end
JavaScript puro senza build (Netlify / Cloudflare Pages, piano gratuito).

---

## 1. Crea il backend su Supabase (10 minuti, gratis)

1. Vai su **https://supabase.com** → *Start your project* → registrati (email o GitHub).
2. Crea un nuovo progetto: nome `calcetto`, password database a scelta (salvala), region `Europe (Frankfurt)` o simile.
3. Attendi ~2 minuti che il progetto sia pronto.
4. Nel menu a sinistra: **SQL Editor** → *New query*.
5. Apri il file `supabase/schema.sql`, copia **tutto** il contenuto, incollalo nell'editor → **Run**. Deve dire "Success. No rows returned".
6. *(Facoltativo, per provare l'app con dati di esempio)*: nuova query → incolla tutto `supabase/seed.sql` → **Run**. Crea 12 profili demo (password `demo1234`) e 6 partite con voti già compilati. Potrai eliminarli in un colpo solo dall'Area Admin → Impostazioni.
7. Menu **Project Settings → API**: copia due valori:
   - **Project URL** (tipo `https://abcd.supabase.co`)
   - **anon public** key (chiave lunga, quella `anon`, **mai** la `service_role`)

## 2. Collega l'app a Supabase

Apri il file **`src/config.js`** e incolla i due valori:

```js
export const SUPABASE_URL = 'https://abcd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

## 3. Abilita il recupero password

Dashboard Supabase → **Authentication → URL Configuration → Site URL**:
inserisci l'URL finale del sito (punto 4, es. `https://calcetto.netlify.app`).
Aggiungi anche `http://localhost:8000` in *Redirect URLs* se vuoi provare in locale.

## 4. Pubblica online su Netlify (gratis)

**Modo semplice (drag & drop):**
1. Crea un account gratuito su **https://netlify.com**.
2. Della cartella del progetto trascina **la cartella intera** (con `index.html`, `src/`, `supabase/`) sulla pagina https://app.netlify.com/drop.
3. Netlify ti dà subito un indirizzo tipo `https://nome-casuale.netlify.app`: è il link da condividere con gli amici.
4. *(Rinomina)*: Site settings → Change site name → `calcetto-amici` → link diventa `https://calcetto-amici.netlify.app`.

**Modo più stabile (GitHub + deploy automatico):**
1. Crea un repository su GitHub e carica la cartella.
2. Netlify → *Add new site* → *Import an existing project* → collega il repo → Deploy.
3. Ogni volta che modifichi il codice su GitHub, il sito si aggiorna da solo.

**Alternativa:** Cloudflare Pages (gratis, identica procedura: *Upload assets* con la cartella).

## 5. Crea l'account ADMIN (tu)

1. Apri l'app → **Registrati** con la tua email vera (es. `tu@gmail.com`) e una password tua.
2. Nel **SQL Editor di Supabase** esegui (sostituisci l'email):

```sql
update public.profiles set is_admin = true
where email = 'tu@gmail.com';
```

3. Riaccedi nell'app: in alto a destra vedrai l'ingranaggio ⚙️ dell'Area Admin.

> **Nota**: per impostazione predefinita Supabase chiede la conferma dell'email.
> Per evitare che i 20 amici debbano confermare: Authentication → Providers → Email →
> disattiva "Confirm email" (o lasciala attiva, è più sicuro).

---

## Credenziali iniziali

- **Admin**: le credenziali sono quelle con cui TI registri al punto 5. Cambiale quando vuoi dalla pagina Profilo → Password. Nessuna credenziale è scritta nel codice.
- **Profili demo** (se eseguito seed.sql): email `demo.calcetto1@example.com` … `demo.calcetto12@example.com`, password `demo1234`. Eliminabili da Area Admin → Impostazioni → "Elimina tutti i dati demo".

## Struttura del codice (per modifiche future)

| File | Contenuto |
|---|---|
| `src/config.js` | **Tutti i parametri**: chiavi Supabase, ore votazione, posti, minimo partite |
| `src/api.js` | Tutte le chiamate al database (unica fonte dati) |
| `supabase/schema.sql` | Tabelle, sicurezza (RLS), regole di voto, statistiche |
| `src/pages/*.js` | Una pagina = un file (home, calendario, voti, statistiche, profilo, admin) |
| `test/` | Test automatici della logica (già eseguiti e superati: 12 gruppi di verifiche) |

## Limiti del piano gratuito e come aggirarli

| Servizio | Limite gratuito | Quando lo raggiungi | Soluzione |
|---|---|---|---|
| Supabase database | 500 MB | anni, con 20 giocatori | piano Pro 25 $/mese |
| Supabase Auth | 50.000 utenti mensili attivi | mai | — |
| Supabase email (recupero password) | ~2-4 email/ora | se molti richiedono il reset | SMTP esterno gratuito (es. Resend) da Authentication → SMTP |
| Netlify | 100 GB traffico/mese | mai con 20 utenti | piano Pro o Cloudflare Pages |
| Dominio personale | non incluso | quando vuoi | acquisto dominio (~10 €/anno, es. su Namecheap o Register.it) → Netlify → Domain settings → Add domain |
