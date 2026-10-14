// Impostazioni e stato, salvati solo sul telefono (localStorage).
const PREFIX = 'jarvis.';

export const DEFAULTS = Object.freeze({
  anthropicKey: '',
  model: 'claude-sonnet-5-5',
  googleClientId: '',
  googleEmail: '',
  youtubeHandle: '',
  clients: '',
  city: 'Roma',
  lat: 41.9028,
  lon: 12.4964,
  ttsProvider: 'google',
  googleTtsKey: '',
  googleVoice: 'Charon',
  openaiKey: '',
  openaiVoice: 'onyx',
  voiceName: '',
  voiceRate: 1.05,
  voiceDepth: 1,
  voiceFx: true,
});

function read(key) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? undefined : JSON.parse(v);
  } catch {
    return undefined;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getSettings() {
  return { ...DEFAULTS, ...(read('settings') || {}) };
}

export function saveSettings(patch) {
  const next = getSettings();
  for (const k of Object.keys(DEFAULTS)) {
    if (patch && k in patch) next[k] = patch[k];
  }
  write('settings', next);
  return next;
}

export function getState(key, fallback = null) {
  const v = read('state.' + key);
  return v === undefined ? fallback : v;
}

export function setState(key, value) {
  write('state.' + key, value);
}

export function removeState(key) {
  try {
    localStorage.removeItem(PREFIX + 'state.' + key);
  } catch {
    /* niente da fare */
  }
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// "Studio Rossi <info@studiorossi.it>" → { name, email }. Una riga per contatto.
export function parseClients(text) {
  return String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(EMAIL_RE);
      if (!m) return null;
      const email = m[0].toLowerCase();
      const name = line
        .replace(m[0], ' ')
        .replace(/[<>:,;()[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { name: name || email, email };
    })
    .filter(Boolean);
}
