// Meteo da Open-Meteo: gratuito, senza chiave.
import { JarvisError } from './errors.js';

const WMO = {
  0: 'sereno',
  1: 'prevalentemente sereno',
  2: 'parzialmente nuvoloso',
  3: 'coperto',
  45: 'nebbia',
  48: 'nebbia con brina',
  51: 'pioviggine debole',
  53: 'pioviggine',
  55: 'pioviggine intensa',
  56: 'pioviggine gelata',
  57: 'pioviggine gelata intensa',
  61: 'pioggia debole',
  63: 'pioggia',
  65: 'pioggia forte',
  66: 'pioggia gelata',
  67: 'pioggia gelata forte',
  71: 'neve debole',
  73: 'neve',
  75: 'neve forte',
  77: 'nevischio',
  80: 'rovesci deboli',
  81: 'rovesci',
  82: 'rovesci violenti',
  85: 'rovesci di neve',
  86: 'forti rovesci di neve',
  95: 'temporale',
  96: 'temporale con grandine',
  99: 'temporale con forte grandine',
};

export const describe = (code) => WMO[code] ?? 'condizioni non classificate';
const STORMS = [95, 96, 99];
const r = (n) => (n == null ? null : Math.round(n));

export async function getWeather({ lat, lon, city }) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'Europe/Rome',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m',
    hourly: 'precipitation_probability',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
  });
  let res;
  try {
    res = await fetch('https://api.open-meteo.com/v1/forecast?' + p);
  } catch {
    throw new JarvisError('Il servizio meteo non risponde.');
  }
  if (!res.ok) throw new JarvisError(`Il servizio meteo ha risposto con un errore (${res.status}).`);
  const j = await res.json();
  const d = j.daily;
  const days = d.time.map((t, i) => ({
    data: t,
    cielo: describe(d.weather_code[i]),
    codice: d.weather_code[i],
    min: r(d.temperature_2m_min[i]),
    max: r(d.temperature_2m_max[i]),
    pioggiaProb: d.precipitation_probability_max[i] ?? null,
    pioggiaMm: d.precipitation_sum[i] ?? null,
    ventoMax: r(d.wind_speed_10m_max[i]),
    raffiche: r(d.wind_gusts_10m_max[i]),
  }));
  const oggi = days[0];

  // Fasce orarie di oggi, da adesso in poi, con pioggia probabile (≥ 40%).
  const nowHour = (j.current.time || '').slice(0, 13);
  const fasce = [];
  let cur = null;
  j.hourly.time.forEach((t, i) => {
    if (!t.startsWith(oggi.data) || t.slice(0, 13) < nowHour) return;
    const prob = j.hourly.precipitation_probability[i] ?? 0;
    const h = Number(t.slice(11, 13));
    if (prob >= 40) {
      if (cur && cur.a === h) {
        cur.a = h + 1;
        cur.max = Math.max(cur.max, prob);
      } else {
        cur = { da: h, a: h + 1, max: prob };
        fasce.push(cur);
      }
    } else cur = null;
  });

  const segnali = [];
  if (STORMS.includes(oggi.codice)) segnali.push('possibili temporali');
  if (oggi.raffiche >= 50) segnali.push(`raffiche fino a ${oggi.raffiche} km/h`);
  if (oggi.pioggiaMm >= 20) segnali.push(`pioggia abbondante (${oggi.pioggiaMm} mm)`);

  const maltempo = (oggi.pioggiaProb ?? 0) >= 50 || STORMS.includes(oggi.codice) || oggi.raffiche >= 60;
  const prossimo = days.slice(1).find((x) => (x.pioggiaProb ?? 0) >= 60);

  return {
    citta: city,
    adesso: {
      temperatura: r(j.current.temperature_2m),
      percepita: r(j.current.apparent_temperature),
      cielo: describe(j.current.weather_code),
      vento: r(j.current.wind_speed_10m),
      raffiche: r(j.current.wind_gusts_10m),
    },
    oggi,
    fascePioggiaOggi: fasce.map((f) => `dalle ${f.da} alle ${f.a} (fino al ${f.max}%)`),
    segnali,
    maltempo,
    prossimoGiornoPiovoso: prossimo ? { data: prossimo.data, pioggiaProb: prossimo.pioggiaProb } : null,
    settimana: days,
    allerteUfficiali: 'non disponibili in questa app',
  };
}
