// Interfaccia: campanella, briefing, conversazione e impostazioni.
import { getSettings, saveSettings, removeState, DEFAULTS } from './store.js';
import { JarvisError, NeedsGoogleAuth } from './errors.js';
import { appUrl, consumeOAuthRedirect, startGoogleLogin, needsGoogleLogin, tokenInfo, forgetGoogle, googleConfigured } from './google.js';
import { runBriefing, chat, loadHistory, remember, clearHistory } from './jarvis.js';
import { canListen, canSpeak, listen, stopListening, speak, stopSpeaking, toSpeech, italianVoices, onVoicesReady } from './voice.js';
import { enableMorningPush, testNotification } from './push.js';
import { renderMarkdown } from './markdown.js';
import { greeting, stamp, clockTime } from './util.js';

const $ = (s) => document.querySelector(s);
const log = $('#log');
const bell = $('#bell');
const hint = $('#bell-hint');
const dlg = $('#settings');
const form = $('#settings-form');
const typebar = $('#typebar');
const typed = $('#typed');
let busy = false;

// --- Stato della campanella ------------------------------------------------

const HINTS = {
  idle: () => (canListen ? 'Tocchi la campanella e parli' : 'La voce non è disponibile qui: usi Scrivi'),
  listening: () => 'La ascolto',
  thinking: () => 'Un momento',
  speaking: () => 'Tocchi la campanella per interrompere',
};
const LABELS = { idle: 'Parla con Jarvis', listening: 'Smetti di ascoltare', thinking: 'Jarvis sta pensando', speaking: 'Interrompi la voce' };

function setMode(mode) {
  bell.dataset.mode = mode;
  hint.textContent = HINTS[mode]();
  bell.setAttribute('aria-label', LABELS[mode]);
  $('#btn-briefing').disabled = mode === 'thinking';
}

// --- Conversazione a schermo ---------------------------------------------

// Porta in vista l'ultimo elemento; se è lungo (un briefing), ne mostra l'inizio.
function scrollEnd(el) {
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  requestAnimationFrame(() => {
    const tall = el && el.offsetHeight > log.clientHeight * 0.6;
    log.scrollTo({ top: tall ? el.offsetTop - 12 : log.scrollHeight, behavior });
  });
}

function jarvisTurn(md, { error = false, actions = [], past = false } = {}) {
  const el = document.createElement('article');
  el.className = `turn jarvis${error ? ' error' : ''}${past ? ' past' : ''}`;
  const body = document.createElement('div');
  body.className = 'prose';
  body.innerHTML = renderMarkdown(md);
  el.append(body);
  const all = !error && canSpeak ? [{ label: 'Ascolta', onClick: () => speakText(md) }, ...actions] : actions;
  if (all.length) {
    const bar = document.createElement('div');
    bar.className = 'turn-actions';
    for (const a of all) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link-btn';
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      bar.append(b);
    }
    el.append(bar);
  }
  log.append(el);
  scrollEnd(el);
  return el;
}

function albyTurn(text, { past = false } = {}) {
  const p = document.createElement('p');
  p.className = `turn alby${past ? ' past' : ''}`;
  p.textContent = text;
  log.append(p);
  scrollEnd();
  return p;
}

function status(text) {
  const p = document.createElement('p');
  p.className = 'status';
  p.textContent = text;
  log.append(p);
  scrollEnd();
  return { set: (t) => (p.textContent = t), done: () => p.remove() };
}

const settingsAction = () => ({ label: 'Apri impostazioni', onClick: openSettings });

function errorTurn(message, actions = []) {
  return jarvisTurn(message, { error: true, actions });
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  try {
    if (t.showPopover) {
      if (t.matches(':popover-open')) t.hidePopover();
      t.showPopover();
    }
  } catch {
    /* popover non supportato: resta visibile come elemento fisso */
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    try {
      if (t.hidePopover && t.matches(':popover-open')) t.hidePopover();
    } catch {
      /* niente */
    }
    t.hidden = true;
  }, 2600);
}

function speakText(md) {
  if (!canSpeak) return;
  stopListening();
  setMode('speaking');
  speak(toSpeech(md), {
    onend: () => setMode('idle'),
    onerror: (e) => {
      setMode('idle');
      toast(e.message);
    },
  });
}

// --- Azioni ----------------------------------------------------------------

function ready() {
  if (getSettings().anthropicKey) return true;
  errorTurn('Mi manca ancora la chiave API Anthropic, signore. Senza quella non posso pensare.', [settingsAction()]);
  return false;
}

function goGoogle(pending) {
  try {
    status("Mi collego a Google…");
    startGoogleLogin(pending);
  } catch (e) {
    errorTurn(e.message, [settingsAction()]);
  }
}

function handleError(e, pending) {
  if (e instanceof NeedsGoogleAuth) return goGoogle(pending);
  if (!(e instanceof JarvisError)) console.error(e);
  errorTurn(e instanceof JarvisError ? e.message : `Imprevisto: ${e?.message || e}`);
}

async function doBriefing() {
  if (busy || !ready()) return;
  if (needsGoogleLogin()) return goGoogle({ type: 'briefing' });
  busy = true;
  stopSpeaking();
  setMode('thinking');
  const st = status('Preparo il briefing…');
  try {
    const text = await runBriefing(st.set);
    st.done();
    setMode('idle');
    jarvisTurn(text);
    remember('Briefing, per favore.', text);
    if (getSettings().autoSpeak) speakText(text);
  } catch (e) {
    st.done();
    setMode('idle');
    handleError(e, { type: 'briefing' });
  } finally {
    busy = false;
  }
}

const TOOL_STATUS = {
  cerca_email: 'Consulto la posta…',
  leggi_agenda: "Consulto l'agenda…",
  statistiche_youtube: 'Controllo il canale…',
  meteo: 'Consulto il meteo…',
};

async function doChat(text, { shown = false } = {}) {
  if (busy || !ready()) return;
  if (needsGoogleLogin()) return goGoogle({ type: 'chat', text });
  if (!shown) albyTurn(text);
  busy = true;
  stopSpeaking();
  setMode('thinking');
  const st = status('Ci penso…');
  try {
    const reply = await chat(text, (name) => st.set(TOOL_STATUS[name] || 'Un momento…'));
    st.done();
    setMode('idle');
    jarvisTurn(reply);
    if (getSettings().autoSpeak) speakText(reply);
  } catch (e) {
    st.done();
    setMode('idle');
    handleError(e, { type: 'chat', text });
  } finally {
    busy = false;
  }
}

const TRIGGER = /^\s*(briefing|buongiorno|buon pomeriggio|buonasera|report|rapporto)([\s,]+jarvis)?[\s.!,]*$/i;
function isBriefingRequest(text) {
  return TRIGGER.test(text) || (/\b(briefing|report)\b/i.test(text) && text.trim().split(/\s+/).length <= 6);
}

function handleText(text) {
  if (isBriefingRequest(text)) {
    albyTurn(text);
    return doBriefing();
  }
  return doChat(text);
}

bell.addEventListener('click', async () => {
  const mode = bell.dataset.mode;
  if (mode === 'speaking') {
    stopSpeaking();
    setMode('idle');
    return;
  }
  if (mode === 'listening') {
    stopListening();
    return;
  }
  if (busy) return;
  if (!canListen) {
    showTypebar();
    return;
  }
  setMode('listening');
  const live = albyTurn('…');
  live.classList.add('live');
  try {
    const text = await listen({ onPartial: (t) => (live.textContent = t || '…') });
    live.classList.remove('live');
    setMode('idle');
    if (!text) {
      live.remove();
      return;
    }
    live.textContent = text;
    if (isBriefingRequest(text)) await doBriefing();
    else await doChat(text, { shown: true });
  } catch (e) {
    live.remove();
    setMode('idle');
    handleError(e);
  }
});

$('#btn-briefing').addEventListener('click', () => doBriefing());

function showTypebar() {
  typebar.hidden = false;
  typed.focus();
}
$('#btn-type').addEventListener('click', () => {
  if (typebar.hidden) showTypebar();
  else typebar.hidden = true;
});
typebar.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = typed.value.trim();
  if (!text || busy) return;
  typed.value = '';
  handleText(text);
});

// --- Intestazione ----------------------------------------------------------

function renderClock() {
  $('#greeting').textContent = `${greeting()}, signore.`;
  $('#clock').textContent = stamp();
}

// --- Impostazioni ----------------------------------------------------------

function renderVoices() {
  const sel = $('#voice-select');
  const current = getSettings().voiceName;
  const voices = italianVoices();
  sel.replaceChildren(new Option(voices.length ? 'Automatica' : 'Nessuna voce italiana trovata', ''));
  for (const v of voices) sel.append(new Option(v.name, v.name, false, v.name === current));
  sel.value = voices.some((v) => v.name === current) ? current : '';
}

function renderGoogleStatus() {
  const t = tokenInfo();
  const el = $('#google-status');
  if (!googleConfigured()) el.textContent = 'Inserisca il Client ID e salvi, poi colleghi Google.';
  else if (t) el.textContent = `Collegato fino alle ${clockTime(new Date(t.exp))}. Dopo, il collegamento si rinnova da solo con un passaggio rapido.`;
  else el.textContent = 'Non collegato.';
}

function renderRate() {
  $('#rate-out').textContent = `${Number(form.elements.voiceRate.value).toFixed(2)}×`;
}

function fillSettings() {
  const s = getSettings();
  for (const [k, v] of Object.entries(s)) {
    const el = form.elements.namedItem(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (k !== 'voiceName') el.value = v ?? '';
  }
  $('#redirect-uri').textContent = appUrl();
  renderVoices();
  renderGoogleStatus();
  renderRate();
}

const num = (v, d) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && String(v).trim() !== '' ? n : d;
};

function readSettings() {
  const f = form.elements;
  return {
    anthropicKey: f.anthropicKey.value.trim(),
    model: f.model.value,
    googleClientId: f.googleClientId.value.trim(),
    googleEmail: f.googleEmail.value.trim(),
    youtubeHandle: f.youtubeHandle.value.trim(),
    clients: f.clients.value,
    city: f.city.value.trim() || DEFAULTS.city,
    lat: num(f.lat.value, DEFAULTS.lat),
    lon: num(f.lon.value, DEFAULTS.lon),
    voiceName: f.voiceName.value,
    voiceRate: num(f.voiceRate.value, 1),
    autoSpeak: f.autoSpeak.checked,
  };
}

function openSettings() {
  fillSettings();
  $('#push-out').hidden = true;
  if (!dlg.open) dlg.showModal();
}

$('#btn-settings').addEventListener('click', openSettings);
$('#btn-close').addEventListener('click', () => dlg.close());
form.elements.voiceRate.addEventListener('input', renderRate);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings(readSettings());
  dlg.close();
  toast('Impostazioni salvate');
});

$('#btn-google').addEventListener('click', () => {
  saveSettings(readSettings());
  if (!googleConfigured()) {
    toast('Prima inserisca il Client ID');
    return;
  }
  try {
    startGoogleLogin(null);
  } catch (e) {
    toast(e.message);
  }
});

$('#btn-voice-test').addEventListener('click', () => {
  const f = form.elements;
  saveSettings({ voiceName: f.voiceName.value, voiceRate: num(f.voiceRate.value, 1) });
  if (!canSpeak) return toast('La sintesi vocale non è disponibile qui');
  speak('Buongiorno, signore. Le sembra una voce adeguata al suo rango?', { onerror: (e) => toast(e.message) });
});

$('#btn-push').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  saveSettings(readSettings());
  try {
    $('#push-secret').value = await enableMorningPush();
    $('#push-out').hidden = false;
    toast('Notifiche attivate');
  } catch (err) {
    toast(err.message);
  } finally {
    b.disabled = false;
  }
});

$('#btn-push-test').addEventListener('click', async () => {
  try {
    await testNotification();
  } catch (err) {
    toast(err.message);
  }
});

$('#btn-clear-chat').addEventListener('click', () => {
  clearHistory();
  log.replaceChildren();
  toast('Conversazione cancellata');
});

$('#btn-reset-yt').addEventListener('click', () => {
  removeState('ytBaseline');
  toast('Conteggi YouTube azzerati');
});

$('#btn-google-off').addEventListener('click', () => {
  forgetGoogle();
  renderGoogleStatus();
  toast('Google scollegato da questo telefono');
});

$('#btn-export').addEventListener('click', () => {
  $('#io-text').value = JSON.stringify(getSettings(), null, 2);
});

$('#btn-import').addEventListener('click', () => {
  try {
    const data = JSON.parse($('#io-text').value);
    if (!data || typeof data !== 'object') throw new Error();
    saveSettings(data);
    fillSettings();
    toast('Impostazioni importate');
  } catch {
    toast('Il testo non è un JSON di impostazioni valido');
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const src = document.getElementById(btn.dataset.copy);
  const text = 'value' in src ? src.value : src.textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato');
  } catch {
    if (src.select) src.select();
    toast('Copia non riuscita: selezioni il testo a mano');
  }
});

// --- Installazione ---------------------------------------------------------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#btn-install').hidden = false;
});
$('#btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $('#btn-install').hidden = true;
});

// --- Avvio -----------------------------------------------------------------

function restoreHistory() {
  for (const m of loadHistory().slice(-6)) {
    if (m.role === 'user') albyTurn(m.content, { past: true });
    else jarvisTurn(m.content, { past: true });
  }
}

function welcome() {
  if (!getSettings().anthropicKey) {
    jarvisTurn(
      "Benvenuto, signore. Prima di cominciare mi servono due cose: la chiave API Anthropic, per pensare, e l'accesso a Google, per posta, agenda e canale. Trova tutto nelle impostazioni.",
      { actions: [settingsAction()] },
    );
  } else if (!log.children.length) {
    jarvisTurn('A sua disposizione. Chieda il briefing, oppure tocchi la campanella e parli.');
  }
}

const OAUTH_ERRORS = {
  access_denied: 'Accesso a Google annullato. Quando vuole, riprovi dalle impostazioni.',
  state_mismatch: 'Risposta di Google non riconosciuta: per prudenza la ignoro. Riprovi il collegamento.',
};

function start() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non registrato', e));
  }
  renderClock();
  setInterval(renderClock, 20_000);
  setMode('idle');
  onVoicesReady(() => dlg.open && renderVoices());
  restoreHistory();

  const oauth = consumeOAuthRedirect();
  const params = new URLSearchParams(location.search);
  const fromNotification = params.get('azione') === 'briefing';
  if (fromNotification) history.replaceState(null, '', appUrl());

  if (oauth?.error) {
    errorTurn(OAUTH_ERRORS[oauth.error] || `Google ha rifiutato l'accesso (${oauth.error}).`, [settingsAction()]);
  } else if (oauth?.ok) {
    const p = oauth.pending;
    if (p?.type === 'briefing') return void doBriefing();
    if (p?.type === 'chat' && p.text) return void doChat(p.text);
    toast('Google collegato');
  }
  if (fromNotification) return void doBriefing();
  welcome();
}

start();
