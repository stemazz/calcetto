// ============================================================================
// AUTENTICAZIONE — login, registrazione, recupero password (tutto in italiano)
// ============================================================================
import { el, toast } from '../ui.js';
import { registra, accedi, recuperaPassword } from '../api.js';

/** Schermata di accesso (mostrata solo a chi non ha effettuato il login) */
export function renderizzaAuth(app) {
  const schedaLogin = () => {
    const email = el('input', { class: 'input', type: 'email', placeholder: 'Email', autocomplete: 'email' });
    const pass = el('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
    const btn = el('button', { class: 'btn btn-primary btn-blocco' }, ['Accedi']);
    const linkReset = el('button', { class: 'btn btn-ghost btn-blocco btn-piccolo', type: 'button' }, ['Password dimenticata?']);

    linkReset.addEventListener('click', async () => {
      if (!email.value) { toast('Scrivi prima la tua email', 'errore'); return; }
      try { await recuperaPassword(email.value); toast('Controlla la casella email: ti ho inviato il link per reimpostare la password.'); }
      catch (e) { toast(e.message, 'errore'); }
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await accedi(email.value.trim(), pass.value); location.hash = '#/home'; location.reload(); }
      catch (e) { toast(e.message, 'errore'); btn.disabled = false; }
    });

    return el('form', { class: 'form', onsubmit: (e) => e.preventDefault() }, [
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Email']), email]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Password']), pass]),
      btn, linkReset,
      el('a', { class: 'auth-link', href: '#registrati',
        onclick: (e) => { e.preventDefault(); mostra(schedaRegistrazione); } }, ['Non hai un account? Registrati']),
    ]);
  };

  const schedaRegistrazione = () => {
    const nome = el('input', { class: 'input', placeholder: 'Nome', autocomplete: 'given-name' });
    const cognome = el('input', { class: 'input', placeholder: 'Cognome o soprannome' });
    const email = el('input', { class: 'input', type: 'email', placeholder: 'Email', autocomplete: 'email' });
    const pass = el('input', { class: 'input', type: 'password', placeholder: 'Password (min 6 caratteri)', autocomplete: 'new-password' });
    const btn = el('button', { class: 'btn btn-primary btn-blocco' }, ['Crea account']);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await registra(email.value.trim(), pass.value,
          { nome: nome.value.trim(), cognome: cognome.value.trim(), soprannome: '' });
        toast('Account creato! Ora accedi.');
        mostra(schedaLogin);
      } catch (e) { toast(e.message, 'errore'); }
      btn.disabled = false;
    });
    return el('form', { class: 'form', onsubmit: (e) => e.preventDefault() }, [
      el('div', { class: 'form-riga' }, [
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Nome']), nome]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Cognome / soprannome']), cognome]),
      ]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Email']), email]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo-label' }, ['Password']), pass]),
      btn,
      el('a', { class: 'auth-link', href: '#accedi',
        onclick: (e) => { e.preventDefault(); mostra(schedaLogin); } }, ['Hai già un account? Accedi']),
    ]);
  };

  function mostra(scheda) {
    contenuto.innerHTML = '';
    contenuto.append(scheda());
  }

  const contenuto = el('div');
  app.innerHTML = '';
  app.append(
    el('div', { class: 'auth-wrap' }, [
      el('div', { class: 'auth-logo' }, ['⚽']),
      el('div', { class: 'auth-titolo' }, ['Calcetto tra Amici']),
      contenuto,
    ])
  );
  mostra(schedaLogin);
}
