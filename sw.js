// Service worker: app disponibile anche offline e notifica mattutina.
const VERSION = 'jarvis-v3';
const FONTS = 'jarvis-fonts';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/errors.js',
  'js/util.js',
  'js/google.js',
  'js/gmail.js',
  'js/calendar.js',
  'js/youtube.js',
  'js/weather.js',
  'js/claude.js',
  'js/jarvis.js',
  'js/voice.js',
  'js/push.js',
  'js/holo.js',
  'js/tts.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Prima la rete, così gli aggiornamenti arrivano subito; la cache solo se offline.
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
  }
  // Tutto il resto (Google, Anthropic, meteo) passa senza cache.
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Buongiorno, signore', {
      body: data.body || 'Il briefing la attende.',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      tag: 'jarvis-briefing',
      renotify: true,
      lang: 'it',
      data: { url: data.url || './?azione=briefing' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of windows) {
        if (c.url.startsWith(self.registration.scope)) {
          await c.focus();
          if ('navigate' in c) await c.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
