// Accesso a Google con flusso OAuth "client-side" (redirect, token di un'ora).
// Nessun server: il token resta sul telefono.
import { getSettings, getState, setState, removeState } from './store.js';
import { JarvisError, NeedsGoogleAuth } from './errors.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
];

// Indirizzo esatto dell'app, da registrare su Google Cloud come URI di reindirizzamento.
export function appUrl() {
  const u = new URL(location.href);
  return u.origin + u.pathname.replace(/index\.html$/, '');
}

export function googleConfigured() {
  return Boolean(getSettings().googleClientId);
}

export function tokenInfo() {
  const t = getState('googleToken');
  return t && t.exp > Date.now() + 60_000 ? t : null;
}

export function needsGoogleLogin() {
  return googleConfigured() && !tokenInfo();
}

export function forgetGoogle() {
  removeState('googleToken');
}

export function startGoogleLogin(pending) {
  const { googleClientId, googleEmail } = getSettings();
  if (!googleClientId) throw new JarvisError('Manca il Client ID Google nelle impostazioni.');
  const state = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
  setState('oauthState', state);
  if (pending) setState('pending', pending);
  else removeState('pending');
  const p = new URLSearchParams({
    client_id: googleClientId.trim(),
    redirect_uri: appUrl(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  if (googleEmail) p.set('login_hint', googleEmail.trim());
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}

// Al ritorno da Google: legge il token dal frammento dell'URL e lo pulisce.
export function consumeOAuthRedirect() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const p = new URLSearchParams(hash);
  history.replaceState(null, '', appUrl() + location.search);
  const expected = getState('oauthState');
  const pending = getState('pending');
  removeState('oauthState');
  removeState('pending');
  if (p.get('error')) return { error: p.get('error'), pending: null };
  if (!expected || p.get('state') !== expected) return { error: 'state_mismatch', pending: null };
  setState('googleToken', {
    token: p.get('access_token'),
    exp: Date.now() + Number(p.get('expires_in') || 3600) * 1000,
    scopes: (p.get('scope') || '').split(' ').filter(Boolean),
  });
  return { ok: true, pending };
}

function serviceName(u) {
  if (u.hostname.startsWith('gmail')) return 'Gmail';
  if (u.pathname.includes('/calendar/')) return 'Google Calendar';
  if (u.pathname.includes('/youtube/')) return 'YouTube';
  return 'Google';
}

function explain(status, msg, u) {
  const svc = serviceName(u);
  if (status === 403 && /disabled|has not been used/i.test(msg)) {
    return `${svc}: l'API non è abilitata nel progetto Google Cloud.`;
  }
  if (status === 403 && /insufficient|scope|permission/i.test(msg)) {
    return `${svc}: permesso non concesso. Ricolleghi Google dalle impostazioni e autorizzi tutte le voci.`;
  }
  if (status === 429 || /quota/i.test(msg)) return `${svc}: quota esaurita, riprovi più tardi.`;
  return `${svc} ha risposto con un errore (${status}): ${msg}`;
}

export async function gfetch(url, params = {}) {
  const t = tokenInfo();
  if (!t) throw new NeedsGoogleAuth();
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else u.searchParams.set(k, String(v));
  }
  let r;
  try {
    r = await fetch(u, { headers: { Authorization: `Bearer ${t.token}` } });
  } catch {
    throw new JarvisError(`${serviceName(u)} non risponde: controlli la connessione.`);
  }
  if (r.status === 401) {
    forgetGoogle();
    throw new NeedsGoogleAuth();
  }
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const b = await r.json();
      msg = b.error?.message || msg;
    } catch {
      /* risposta non JSON */
    }
    throw new JarvisError(explain(r.status, msg, u));
  }
  return r.json();
}
