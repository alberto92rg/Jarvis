// Notifica mattutina di Jarvis, inviata da GitHub Actions (.github/workflows/morning.yml).
// Legge il segreto JARVIS_PUSH creato dall'app, aggiunge il meteo e invia la notifica push.
import { fileURLToPath } from 'node:url';

const TZ = 'Europe/Rome';
const ORA = Number(process.env.JARVIS_ORA || 7);

const LINES = [
  'Il caffè è suo, il briefing è mio. Quando vuole.',
  'Ho messo in ordine la giornata. Manca solo lei.',
  'Le novità della notte sono pronte. Nessuna esplosione, per ora.',
  'Il mondo si è svegliato prima di lei. Le ho preparato un riassunto.',
  'Briefing pronto. Ho evitato di svegliarla con una fanfara.',
  'La giornata è apparecchiata, signore. Si accomodi.',
];

export function romeHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
}

export function composeMessage(wx, { city = 'Roma', date = new Date() } = {}) {
  const day = Math.floor(date.getTime() / 864e5);
  const line = LINES[day % LINES.length];
  const base = { title: 'Buongiorno, signore', url: './?azione=briefing' };
  if (!wx?.daily) return { ...base, body: line };
  const d = wx.daily;
  const min = Math.round(d.temperature_2m_min[0]);
  const max = Math.round(d.temperature_2m_max[0]);
  const prob = d.precipitation_probability_max[0] ?? 0;
  const code = d.weather_code[0];
  const gusts = d.wind_gusts_10m_max?.[0] ?? 0;
  const bad = prob >= 50 || [95, 96, 99].includes(code) || gusts >= 60;
  const meteo = `${city}: ${min}-${max} °C, pioggia al ${prob}%.`;
  const advice = bad ? "Le suggerirei lo smart working: l'ombrello la ringrazierà." : line;
  return { ...base, body: `${meteo} ${advice}` };
}

async function fetchWeather(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TZ,
    forecast_days: '1',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max',
  });
  const r = await fetch('https://api.open-meteo.com/v1/forecast?' + p);
  if (!r.ok) throw new Error(`meteo ${r.status}`);
  return r.json();
}

async function main() {
  const force = process.env.FORCE === 'true';
  const hour = romeHour();
  if (!force && hour !== ORA) {
    console.log(`A Roma sono le ${hour}: la notifica è prevista alle ${ORA}, salto questo giro.`);
    return;
  }
  const raw = process.env.JARVIS_PUSH;
  if (!raw) {
    console.error('Manca il segreto JARVIS_PUSH: lo crei in Settings > Secrets and variables > Actions.');
    process.exit(1);
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    console.error("JARVIS_PUSH non è un JSON valido: lo ricopi dall'app (Impostazioni > Notifica mattutina).");
    process.exit(1);
  }

  let wx = null;
  try {
    wx = await fetchWeather(cfg.lat ?? 41.9028, cfg.lon ?? 12.4964);
  } catch (e) {
    console.warn('Meteo non disponibile, invio la notifica senza:', e.message);
  }
  const msg = composeMessage(wx, { city: cfg.citta || 'Roma' });

  if (process.env.DRY_RUN === 'true') {
    console.log(JSON.stringify(msg, null, 2));
    return;
  }

  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(cfg.subject || 'mailto:jarvis@example.com', cfg.vapidPublicKey, cfg.vapidPrivateKey);
  try {
    const res = await webpush.sendNotification(cfg.subscription, JSON.stringify(msg), { TTL: 4 * 3600, urgency: 'normal' });
    console.log(`Notifica inviata (${res.statusCode}): ${msg.body}`);
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      console.error("L'iscrizione alle notifiche è scaduta: la riattivi dall'app e aggiorni il segreto JARVIS_PUSH.");
    } else {
      console.error('Invio non riuscito:', e.statusCode || '', e.body || e.message);
    }
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
