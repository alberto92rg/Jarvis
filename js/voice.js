// Ascolto (riconoscimento vocale) e parola (sintesi vocale) del browser.
import { getSettings } from './store.js';
import { JarvisError } from './errors.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = Boolean(SR);
export const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let rec = null;

export function listen({ onPartial } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new JarvisError('Il riconoscimento vocale non è disponibile su questo browser.'));
    rec = new SR();
    rec.lang = 'it-IT';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let done = false;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      onPartial?.(`${finalText} ${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (done) return;
      done = true;
      rec = null;
      if (e.error === 'no-speech' || e.error === 'aborted') resolve(finalText.trim());
      else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        reject(new JarvisError('Il microfono non è autorizzato. Lo consenta nelle impostazioni del browser.'));
      } else reject(new JarvisError(`Ascolto interrotto (${e.error}).`));
    };
    rec.onend = () => {
      if (done) return;
      done = true;
      rec = null;
      resolve(finalText.trim());
    };
    try {
      rec.start();
    } catch {
      done = true;
      rec = null;
      reject(new JarvisError('Non riesco ad avviare il microfono.'));
    }
  });
}

export function stopListening() {
  try {
    rec?.stop();
  } catch {
    /* già fermo */
  }
}

export function italianVoices() {
  if (!canSpeak) return [];
  return speechSynthesis.getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith('it'));
}

export function onVoicesReady(cb) {
  if (!canSpeak) return;
  cb();
  speechSynthesis.addEventListener?.('voiceschanged', cb);
}

function pickVoice() {
  const { voiceName } = getSettings();
  const list = italianVoices();
  return list.find((v) => v.name === voiceName) || list.find((v) => /google/i.test(v.name)) || list[0] || null;
}

// Frasi brevi: alcuni motori interrompono le letture troppo lunghe.
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

let speakToken = 0;

export function speak(text, { onend, onerror } = {}) {
  if (!canSpeak) {
    onerror?.(new JarvisError('La sintesi vocale non è disponibile su questo browser.'));
    return;
  }
  speechSynthesis.cancel();
  const token = ++speakToken;
  const parts = chunks(text);
  const voice = pickVoice();
  const rate = Number(getSettings().voiceRate) || 1;
  let i = 0;
  const next = () => {
    if (token !== speakToken) return;
    if (i >= parts.length) {
      onend?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    u.lang = 'it-IT';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 0.95;
    u.onend = next;
    u.onerror = (e) => {
      if (token !== speakToken) return;
      if (e.error === 'interrupted' || e.error === 'canceled') {
        onend?.();
        return;
      }
      onerror?.(
        new JarvisError(e.error === 'not-allowed' ? 'Tocchi "Ascolta" per sentire la risposta.' : `Lettura interrotta (${e.error}).`),
      );
    };
    speechSynthesis.speak(u);
  };
  next();
}

export function stopSpeaking() {
  speakToken++;
  if (canSpeak) speechSynthesis.cancel();
}

// Dal markdown a un testo che suoni bene letto ad alta voce.
export function toSpeech(md) {
  return String(md)
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\s*>\s*/, '')
        .replace(/^\s*[-*•]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .trim(),
    )
    .filter((l) => l && !/^[-*]{3,}$/.test(l))
    .map((l) => (/[.!?…:;]$/.test(l) ? l : l + '.'))
    .join(' ')
    .replace(/\*\*|__|\*|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/°C/g, ' gradi')
    .replace(/km\/h/g, ' chilometri orari')
    .replace(/\s+/g, ' ')
    .trim();
}
