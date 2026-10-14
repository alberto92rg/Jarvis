// La voce di Jarvis: sintesi HD (Google Chirp 3 HD o OpenAI) con effetto
// "sistema di bordo" via Web Audio; la voce del telefono resta di riserva.
import { getSettings } from './store.js';
import { JarvisError } from './errors.js';

export const GOOGLE_VOICES = [
  'Charon', 'Iapetus', 'Algenib', 'Orus', 'Fenrir', 'Alnilam', 'Rasalgethi', 'Sadaltager',
  'Schedar', 'Umbriel', 'Enceladus', 'Achird', 'Algieba', 'Puck', 'Sadachbia', 'Zubenelgenubi',
];
export const OPENAI_VOICES = ['onyx', 'cedar', 'ash', 'echo', 'ballad', 'verse', 'fable', 'sage', 'alloy'];

const OPENAI_STYLE =
  "Parla in italiano con voce maschile calda, profonda e raffinata: il maggiordomo digitale di un inventore geniale. " +
  'Tono calmo e misurato, dizione impeccabile, ironia asciutta appena accennata, ritmo scorrevole senza fretta.';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// --- Catena audio -----------------------------------------------------------

let ac = null;
let fxBus = null;
let plainBus = null;
let analyser = null;
let timeBuf = null;
let current = null;
let browserSpeaking = false;

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensureContext() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new JarvisError("Questo browser non supporta l'audio avanzato.");
  ac = new AC();

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  analyser = ac.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;
  timeBuf = new Uint8Array(analyser.fftSize);
  comp.connect(analyser);
  analyser.connect(ac.destination);

  plainBus = ac.createGain();
  plainBus.connect(comp);

  // Effetto "sistema di bordo": calore, presenza, un velo di riverbero e un doppio appena percettibile.
  fxBus = ac.createGain();
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 85;
  const warm = ac.createBiquadFilter();
  warm.type = 'lowshelf';
  warm.frequency.value = 180;
  warm.gain.value = 2.5;
  const presence = ac.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 0.9;
  presence.gain.value = 3;
  const soft = ac.createBiquadFilter();
  soft.type = 'highshelf';
  soft.frequency.value = 9000;
  soft.gain.value = -2;
  fxBus.connect(hp).connect(warm).connect(presence).connect(soft);

  const dry = ac.createGain();
  dry.gain.value = 1;
  soft.connect(dry).connect(comp);

  const dly = ac.createDelay(0.05);
  dly.delayTime.value = 0.012;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.23;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 0.0018;
  lfo.connect(lfoGain).connect(dly.delayTime);
  lfo.start();
  const dbl = ac.createGain();
  dbl.gain.value = 0.16;
  soft.connect(dly).connect(dbl).connect(comp);

  const rev = ac.createConvolver();
  rev.buffer = impulse(ac, 0.7, 3.2);
  const revGain = ac.createGain();
  revGain.gain.value = 0.11;
  soft.connect(rev).connect(revGain).connect(comp);
  return ac;
}

// Da chiamare dentro un tocco: sblocca l'audio su telefono.
export function unlockAudio() {
  try {
    const ctx = ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* resta la voce del telefono */
  }
}

export function audioReady() {
  return Boolean(ac && ac.state === 'running');
}

// --- Fornitori ----------------------------------------------------------------

export function provider(s = getSettings()) {
  if (s.ttsProvider === 'google' && s.googleTtsKey) return 'google';
  if (s.ttsProvider === 'openai' && s.openaiKey) return 'openai';
  return 'browser';
}

const depthRate = (s) => Math.pow(2, -clamp(Number(s.voiceDepth) || 0, 0, 4) / 12);

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function googleError(status, msg) {
  if (/billing/i.test(msg)) return 'Voce HD: Google richiede la fatturazione attiva sul progetto.';
  if (/has not been used|disabled|not enabled/i.test(msg)) return 'Voce HD: Cloud Text-to-Speech API non è abilitata nel progetto.';
  if (/referer|referrer|API key not valid|API_KEY_INVALID|blocked/i.test(msg)) {
    return 'Voce HD: la chiave API di Google non è valida o non è autorizzata per questo sito.';
  }
  if (status === 429 || /quota/i.test(msg)) return 'Voce HD: quota di Google esaurita.';
  return `Voce HD non disponibile (${status}): ${msg}`;
}

async function googleTTS(text, s) {
  const rate = clamp((Number(s.voiceRate) || 1) / depthRate(s), 0.25, 2);
  let r;
  try {
    r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(s.googleTtsKey.trim())}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'it-IT', name: `it-IT-Chirp3-HD-${s.googleVoice || 'Charon'}` },
        audioConfig: { audioEncoding: 'MP3', speakingRate: Number(rate.toFixed(3)) },
      }),
    });
  } catch {
    throw new JarvisError('Voce HD: Google non risponde.');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).error?.message || msg;
    } catch {
      /* non JSON */
    }
    throw new JarvisError(googleError(r.status, msg));
  }
  const j = await r.json();
  if (!j.audioContent) throw new JarvisError('Voce HD: risposta vuota da Google.');
  return b64ToBuffer(j.audioContent);
}

async function openaiTTS(text, s) {
  let r;
  try {
    r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.openaiKey.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: s.openaiVoice || 'onyx',
        input: text,
        instructions: OPENAI_STYLE,
        response_format: 'mp3',
      }),
    });
  } catch {
    throw new JarvisError('Voce HD: OpenAI non risponde.');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).error?.message || msg;
    } catch {
      /* non JSON */
    }
    if (r.status === 401) throw new JarvisError('Voce HD: la chiave OpenAI non è valida.');
    if (r.status === 429) throw new JarvisError('Voce HD: credito o quota OpenAI esauriti.');
    throw new JarvisError(`Voce HD non disponibile (${r.status}): ${msg}`);
  }
  return r.arrayBuffer();
}

// Prepara l'audio di un testo. Restituisce un elemento da passare a play().
export async function synth(text, s = getSettings()) {
  const p = provider(s);
  if (p === 'browser') return { kind: 'browser', text };
  const data = p === 'google' ? await googleTTS(text, s) : await openaiTTS(text, s);
  const ctx = ensureContext();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(data);
  } catch {
    throw new JarvisError('Voce HD: audio ricevuto non leggibile.');
  }
  return { kind: 'buffer', buffer, rate: depthRate(s), fx: s.voiceFx !== false, text };
}

// --- Riproduzione -----------------------------------------------------------

export function stop() {
  const c = current;
  current = null;
  c?.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  browserSpeaking = false;
}

export function play(item) {
  stop();
  return new Promise((resolve, reject) => {
    if (item.kind === 'buffer') {
      const ctx = ensureContext();
      if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = item.buffer;
      src.playbackRate.value = item.rate || 1;
      src.connect(item.fx ? fxBus : plainBus);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (current?.src === src) current = null;
        resolve();
      };
      src.onended = finish;
      current = {
        src,
        stop() {
          src.onended = null;
          try {
            src.stop();
          } catch {
            /* già fermo */
          }
          finish();
        },
      };
      src.start();
      return;
    }
    browserSay(item.text, resolve, reject);
  });
}

export function level() {
  if (current?.src && analyser) {
    analyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / timeBuf.length) * 4.5);
  }
  if (browserSpeaking) return 0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 110));
  return 0;
}

export function spectrum(out) {
  if (current?.src && analyser) {
    analyser.getByteFrequencyData(out);
    return;
  }
  const t = performance.now() / 120;
  for (let i = 0; i < out.length; i++) {
    out[i] = browserSpeaking ? (120 + 100 * Math.sin(t + i * 0.9) * Math.sin(t * 0.7 + i)) | 0 : 0;
  }
}

// --- Voce del telefono (riserva) --------------------------------------------

export const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function italianVoices() {
  if (!canSpeak) return [];
  return speechSynthesis.getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith('it'));
}

function pickVoice(name) {
  const list = italianVoices();
  return list.find((v) => v.name === name) || list.find((v) => /google/i.test(v.name)) || list[0] || null;
}

function chunks(text) {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > 180) {
      out.push(cur.trim());
      cur = s;
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function browserSay(text, resolve, reject) {
  if (!canSpeak) {
    reject(new JarvisError('Nessuna voce disponibile su questo browser.'));
    return;
  }
  const s = getSettings();
  speechSynthesis.cancel();
  const parts = chunks(text);
  const voice = pickVoice(s.voiceName);
  let i = 0;
  let done = false;
  const token = {};
  const finish = () => {
    if (done) return;
    done = true;
    browserSpeaking = false;
    if (current?.token === token) current = null;
    resolve();
  };
  current = { token, stop: finish };
  browserSpeaking = true;
  const next = () => {
    if (done) return;
    if (i >= parts.length) return finish();
    const u = new SpeechSynthesisUtterance(parts[i++]);
    u.lang = 'it-IT';
    if (voice) u.voice = voice;
    u.rate = clamp(Number(s.voiceRate) || 1, 0.6, 1.6);
    u.pitch = 0.82;
    u.onend = next;
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return finish();
      done = true;
      browserSpeaking = false;
      reject(new JarvisError(`Lettura interrotta (${e.error}).`));
    };
    speechSynthesis.speak(u);
  };
  next();
}
