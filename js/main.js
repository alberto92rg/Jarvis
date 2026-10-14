// Regia: ologramma, voce, briefing e impostazioni.
import { getSettings, saveSettings, removeState, getState, setState as setStateFlag, DEFAULTS } from './store.js';
import { JarvisError, NeedsGoogleAuth } from './errors.js';
import { appUrl, consumeOAuthRedirect, startGoogleLogin, needsGoogleLogin, tokenInfo, forgetGoogle, googleConfigured } from './google.js';
import { runBriefing, chat, clearHistory } from './jarvis.js';
import { canListen, listen, stopListening } from './voice.js';
import * as tts from './tts.js';
import { createHolo, SECTIONS } from './holo.js';
import { enableMorningPush, testNotification } from './push.js';
import { clockTime } from './util.js';

const $ = (s) => document.querySelector(s);
const coreBtn = $('#core');
const dlg = $('#settings');
const form = $('#settings-form');

const holo = createHolo($('#holo'), { level: tts.level, spectrum: tts.spectrum });

let busy = false;
let session = 0;
let prepared = null;

// --- Stato ------------------------------------------------------------------

const CORE_LABEL = {
  idle: 'Parla con Jarvis',
  listening: 'Smetti di ascoltare',
  thinking: 'Jarvis sta elaborando',
  speaking: 'Interrompi Jarvis',
  ready: 'Avvia il briefing',
};

function setState(state) {
  document.body.dataset.state = state;
  holo.setMode(state);
  coreBtn.setAttribute('aria-label', CORE_LABEL[state] || CORE_LABEL.idle);
  $('#btn-briefing').disabled = state === 'thinking' || state === 'speaking';
}

function rest() {
  setState('idle');
  holo.setIcon('core');
  holo.setMetric('');
  holo.setProgress(-1);
  document.body.dataset.section = '';
}

function placeCore() {
  const g = holo.geometry();
  const size = g.r * 2.1;
  Object.assign(coreBtn.style, {
    left: `${g.x - size / 2}px`,
    top: `${g.y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
}

// --- Messaggi brevi -----------------------------------------------------------

let statusTimer;
function status(text, { warn = false, settings = false, sticky = false } = {}) {
  const el = $('#status');
  const action = $('#status-action');
  clearTimeout(statusTimer);
  el.textContent = text || '';
  el.classList.toggle('warn', warn);
  el.classList.toggle('show', Boolean(text));
  action.hidden = !settings;
  if (text && !sticky) {
    statusTimer = setTimeout(() => {
      el.classList.remove('show');
      action.hidden = true;
    }, 7000);
  }
}

function say(text) {
  $('#sr-live').textContent = text;
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
    /* popover non supportato */
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

// --- Errori -------------------------------------------------------------------

function ready() {
  if (getSettings().anthropicKey) return true;
  holo.flash(true);
  status('Mi manca la chiave API Anthropic, signore.', { warn: true, settings: true, sticky: true });
  return false;
}

function goGoogle(pending) {
  try {
    status('Collegamento a Google…');
    startGoogleLogin(pending);
  } catch (e) {
    status(e.message, { warn: true, settings: true, sticky: true });
  }
}

function fail(e, pending) {
  if (e instanceof NeedsGoogleAuth) return goGoogle(pending);
  if (!(e instanceof JarvisError)) console.error(e);
  rest();
  holo.flash(true);
  const msg = e instanceof JarvisError ? e.message : `Imprevisto: ${e?.message || e}`;
  status(msg, { warn: true, settings: /chiave|impostazioni|configurat|Client ID/i.test(msg), sticky: true });
}

let voiceWarned = false;
function voiceFallback(e) {
  if (voiceWarned) return;
  voiceWarned = true;
  status(`${e.message} Uso la voce del telefono.`, { warn: true });
}

// --- Voce -----------------------------------------------------------------------

async function prepareSpeech(text) {
  try {
    return await tts.synth(text);
  } catch (e) {
    voiceFallback(e);
    return { kind: 'browser', text };
  }
}

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    fn().then(res, rej).finally(() => {
      active--;
      next();
    });
  };
  return (fn) =>
    new Promise((res, rej) => {
      queue.push({ fn, res, rej });
      next();
    });
}

// --- Briefing -------------------------------------------------------------------

async function prepareBriefing(my) {
  setState('thinking');
  holo.setIcon('core');
  holo.setMetric('');
  holo.setProgress(-1);
  holo.resetSatellites('off');
  status('');
  const plan = await runBriefing((name, ok) => holo.setSatellite(name, ok ? 'ok' : 'error'));
  if (my !== session) return null;
  const run = limiter(3);
  const audio = plan.segments.map((seg) => run(() => prepareSpeech(seg.text)));
  return { plan, audio };
}

async function playBriefing(prep, my) {
  const { plan, audio } = prep;
  const n = plan.segments.length;
  setState('speaking');
  holo.resetSatellites('pending');
  for (let i = 0; i < n; i++) {
    const item = await audio[i];
    if (my !== session) return;
    const seg = plan.segments[i];
    document.body.dataset.section = seg.id;
    document.body.dataset.metric = seg.metric || '';
    holo.setIcon(seg.icon, { alert: Boolean(seg.alert) });
    holo.setMetric(seg.metric || '');
    holo.setProgress(i / n);
    if (SECTIONS.includes(seg.id)) holo.setSatellite(seg.id, 'active', seg.id === 'meteo' ? seg.icon : undefined);
    say(seg.text);
    try {
      await tts.play(item);
    } catch (e) {
      voiceFallback(e);
    }
    if (my !== session) return;
    if (SECTIONS.includes(seg.id)) holo.setSatellite(seg.id, 'done');
    await new Promise((r) => setTimeout(r, 260));
  }
  holo.setProgress(1);
  await new Promise((r) => setTimeout(r, 500));
  if (my === session) {
    holo.resetSatellites('off');
    rest();
  }
}

async function startBriefing({ autoplay = true } = {}) {
  if (busy) return;
  if (!ready()) return;
  if (needsGoogleLogin()) return goGoogle({ type: 'briefing' });
  busy = true;
  prepared = null;
  voiceWarned = false;
  const my = ++session;
  if (autoplay) tts.unlockAudio();
  try {
    const prep = await prepareBriefing(my);
    if (!prep) return;
    if (!autoplay && !tts.audioReady()) {
      await Promise.all(prep.audio);
      if (my !== session) return;
      prepared = prep;
      setState('ready');
      holo.setIcon('start');
      return;
    }
    await playBriefing(prep, my);
  } catch (e) {
    if (my === session) fail(e, { type: 'briefing' });
  } finally {
    if (my === session) busy = false;
  }
}

async function playPrepared() {
  const prep = prepared;
  prepared = null;
  if (!prep) return rest();
  tts.unlockAudio();
  busy = true;
  const my = ++session;
  try {
    await playBriefing(prep, my);
  } finally {
    if (my === session) busy = false;
  }
}

// --- Conversazione -------------------------------------------------------------

const TOOL_ICON = { cerca_email: 'mail', leggi_agenda: 'calendar', statistiche_youtube: 'play', meteo: 'sun' };
const TRIGGER = /^\s*(briefing|buongiorno|buon pomeriggio|buonasera|report|rapporto)([\s,]+jarvis)?[\s.!,]*$/i;
const isBriefingRequest = (t) => TRIGGER.test(t) || (/\b(briefing|report)\b/i.test(t) && t.trim().split(/\s+/).length <= 6);

async function converse(text) {
  if (!ready()) return rest();
  if (needsGoogleLogin()) return goGoogle({ type: 'chat', text });
  busy = true;
  voiceWarned = false;
  const my = ++session;
  try {
    setState('thinking');
    holo.setIcon('core');
    let lastIcon = 'wave';
    const reply = await chat(text, (name) => {
      lastIcon = TOOL_ICON[name] || lastIcon;
      holo.setIcon(lastIcon);
    });
    if (my !== session) return;
    const item = await prepareSpeech(reply);
    if (my !== session) return;
    setState('speaking');
    holo.setIcon(lastIcon);
    say(reply);
    await tts.play(item).catch(voiceFallback);
    if (my === session) rest();
  } catch (e) {
    if (my === session) fail(e, { type: 'chat', text });
  } finally {
    if (my === session) busy = false;
  }
}

async function onCore() {
  const state = document.body.dataset.state;
  if (state === 'ready') return playPrepared();
  if (state === 'speaking') {
    session++;
    tts.stop();
    busy = false;
    holo.resetSatellites('off');
    return rest();
  }
  if (state === 'listening') return stopListening();
  if (busy) return;
  tts.unlockAudio();
  if (!canListen) {
    status('Il riconoscimento vocale non è disponibile su questo browser.', { warn: true });
    return;
  }
  status('');
  setState('listening');
  holo.setIcon('mic');
  try {
    const text = await listen();
    if (document.body.dataset.state !== 'listening') return;
    if (!text) return rest();
    if (isBriefingRequest(text)) {
      rest();
      return startBriefing({ autoplay: true });
    }
    await converse(text);
  } catch (e) {
    fail(e);
  }
}

coreBtn.addEventListener('click', onCore);
$('#btn-briefing').addEventListener('click', () => startBriefing({ autoplay: true }));

// --- Impostazioni --------------------------------------------------------------

function fillSelect(sel, values, current, labelFn = (v) => v) {
  sel.replaceChildren(...values.map((v) => new Option(labelFn(v), v, false, v === current)));
  if (values.includes(current)) sel.value = current;
}

function renderVoices() {
  const s = getSettings();
  fillSelect($('#google-voice'), tts.GOOGLE_VOICES, s.googleVoice);
  fillSelect($('#openai-voice'), tts.OPENAI_VOICES, s.openaiVoice);
  const sel = $('#voice-select');
  const voices = tts.italianVoices();
  sel.replaceChildren(new Option(voices.length ? 'Automatica' : 'Nessuna voce italiana trovata', ''));
  for (const v of voices) sel.append(new Option(v.name, v.name, false, v.name === s.voiceName));
  sel.value = voices.some((v) => v.name === s.voiceName) ? s.voiceName : '';
}

function renderProvider() {
  const p = form.elements.ttsProvider.value;
  form.querySelectorAll('[data-provider]').forEach((el) => (el.hidden = el.dataset.provider !== p));
}

function renderGoogleStatus() {
  const t = tokenInfo();
  const el = $('#google-status');
  if (!googleConfigured()) el.textContent = 'Inserisca il Client ID e salvi, poi colleghi Google.';
  else if (t) el.textContent = `Collegato fino alle ${clockTime(new Date(t.exp))}. Dopo, il collegamento si rinnova con un passaggio rapido.`;
  else el.textContent = 'Non collegato.';
}

function renderRanges() {
  $('#rate-out').textContent = `${Number(form.elements.voiceRate.value).toFixed(2)}×`;
  const d = Number(form.elements.voiceDepth.value);
  $('#depth-out').textContent = d ? `−${String(d).replace('.', ',')} ${d === 1 ? 'semitono' : 'semitoni'}` : 'naturale';
}

function fillSettings() {
  const s = getSettings();
  for (const [k, v] of Object.entries(s)) {
    const el = form.elements.namedItem(k);
    if (!el || el.tagName === 'SELECT' && ['googleVoice', 'openaiVoice', 'voiceName'].includes(k)) continue;
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else el.value = v ?? '';
  }
  $('#redirect-uri').textContent = appUrl();
  renderVoices();
  renderProvider();
  renderGoogleStatus();
  renderRanges();
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
    ttsProvider: f.ttsProvider.value,
    googleTtsKey: f.googleTtsKey.value.trim(),
    googleVoice: f.googleVoice.value || DEFAULTS.googleVoice,
    openaiKey: f.openaiKey.value.trim(),
    openaiVoice: f.openaiVoice.value || DEFAULTS.openaiVoice,
    voiceName: f.voiceName.value,
    voiceRate: num(f.voiceRate.value, DEFAULTS.voiceRate),
    voiceDepth: num(f.voiceDepth.value, DEFAULTS.voiceDepth),
    voiceFx: f.voiceFx.checked,
    googleClientId: f.googleClientId.value.trim(),
    googleEmail: f.googleEmail.value.trim(),
    youtubeHandle: f.youtubeHandle.value.trim(),
    clients: f.clients.value,
    city: f.city.value.trim() || DEFAULTS.city,
    lat: num(f.lat.value, DEFAULTS.lat),
    lon: num(f.lon.value, DEFAULTS.lon),
  };
}

function openSettings() {
  fillSettings();
  $('#push-out').hidden = true;
  if (!dlg.open) dlg.showModal();
}

$('#btn-settings').addEventListener('click', openSettings);
$('#status-action').addEventListener('click', openSettings);
$('#btn-close').addEventListener('click', () => dlg.close());
form.elements.voiceRate.addEventListener('input', renderRanges);
form.elements.voiceDepth.addEventListener('input', renderRanges);
form.elements.ttsProvider.addEventListener('change', renderProvider);
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => dlg.open && renderVoices());

form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings(readSettings());
  dlg.close();
  status('');
  toast('Impostazioni salvate');
});

$('#btn-voice-test').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  tts.unlockAudio();
  saveSettings(readSettings());
  b.disabled = true;
  voiceWarned = false;
  try {
    const item = await tts.synth('Buongiorno, signore. Sistemi vocali online. Le sembra una voce adeguata al suo rango?');
    await tts.play(item);
  } catch (err) {
    toast(err.message);
    try {
      await tts.play({ kind: 'browser', text: 'Voce del telefono, signore. In attesa di istruzioni.' });
    } catch {
      /* nessuna voce */
    }
  } finally {
    b.disabled = false;
  }
});

$('#btn-google').addEventListener('click', () => {
  saveSettings(readSettings());
  if (!googleConfigured()) return toast('Prima inserisca il Client ID');
  try {
    startGoogleLogin(null);
  } catch (err) {
    toast(err.message);
  }
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

// --- Installazione ---------------------------------------------------------------

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

// --- Avvio -----------------------------------------------------------------------

const OAUTH_ERRORS = {
  access_denied: 'Accesso a Google annullato. Riprovi dalle impostazioni.',
  state_mismatch: 'Risposta di Google non riconosciuta: per prudenza la ignoro.',
};

function start() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch((e) => console.warn('Service worker non registrato', e));
    // Quando arriva una versione nuova, la pagina si ricarica da sola (se Jarvis non sta parlando).
    let reloaded = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || busy) return;
      reloaded = true;
      location.reload();
    });
  }
  placeCore();
  window.addEventListener('resize', () => requestAnimationFrame(placeCore));
  rest();

  const oauth = consumeOAuthRedirect();
  const params = new URLSearchParams(location.search);
  const fromNotification = params.get('azione') === 'briefing';
  if (fromNotification) history.replaceState(null, '', appUrl());

  if (oauth?.error) {
    status(OAUTH_ERRORS[oauth.error] || `Google ha rifiutato l'accesso (${oauth.error}).`, { warn: true, settings: true, sticky: true });
  } else if (oauth?.ok) {
    const p = oauth.pending;
    if (p?.type === 'briefing') return void startBriefing({ autoplay: false });
    if (p?.type === 'chat' && p.text) {
      status('Google collegato. Tocchi il nucleo e ripeta la domanda.');
      return;
    }
    toast('Google collegato');
  }
  if (fromNotification) return void startBriefing({ autoplay: false });
  if (!getSettings().anthropicKey) {
    status('Benvenuto, signore. Configuri Jarvis nelle impostazioni.', { settings: true, sticky: true });
  } else if (!getState('hintShown')) {
    setStateFlag('hintShown', true);
    status('Tocchi il nucleo per parlare, il pulsante a sinistra per il briefing.');
  }
}

start();
