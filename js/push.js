// Notifica mattutina: iscrizione Web Push con chiavi generate sul telefono.
// Il testo prodotto va incollato una volta nel segreto JARVIS_PUSH su GitHub.
import { getSettings, getState, setState } from './store.js';
import { JarvisError } from './errors.js';
import { appUrl } from './google.js';

export const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const toB64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const fromB64u = (s) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  t += '='.repeat((4 - (t.length % 4)) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};

// Coppia di chiavi VAPID (P-256): pubblica in formato "raw", privata come scalare d.
export async function generateVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: toB64u(raw), privateKey: jwk.d };
}

async function askPermission() {
  if (Notification.permission === 'granted') return;
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new JarvisError('Notifiche non autorizzate. Le consenta nelle impostazioni del telefono.');
}

export async function enableMorningPush() {
  if (!canPush) {
    throw new JarvisError("Questo browser non supporta le notifiche push. Installi l'app nella schermata Home e riprovi.");
  }
  await askPermission();
  const reg = await navigator.serviceWorker.ready;
  let keys = getState('vapid');
  if (!keys) {
    keys = await generateVapid();
    setState('vapid', keys);
  }
  let sub = await reg.pushManager.getSubscription();
  const current = sub?.options?.applicationServerKey;
  if (sub && current && toB64u(current) !== keys.publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(keys.publicKey) });
    } catch (e) {
      throw new JarvisError(`Iscrizione alle notifiche non riuscita: ${e.message}`);
    }
  }
  const s = getSettings();
  return JSON.stringify({
    subscription: sub.toJSON(),
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    subject: location.protocol === 'https:' ? appUrl() : 'mailto:jarvis@example.com',
    citta: s.city,
    lat: Number(s.lat),
    lon: Number(s.lon),
  });
}

export async function testNotification() {
  if (!canPush) throw new JarvisError('Questo browser non supporta le notifiche.');
  await askPermission();
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Jarvis', {
    body: 'Prova riuscita, signore. Domattina farò lo stesso, con il meteo.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: 'jarvis-prova',
    lang: 'it',
  });
}
