// Date e orari, sempre nel fuso di Roma.
export const TZ = 'Europe/Rome';

const fmt = (opts, locale = 'it-IT') => new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts });

export function hourInRome(d = new Date()) {
  return Number(fmt({ hour: '2-digit', hourCycle: 'h23' }).format(d));
}

export function greeting(d = new Date()) {
  const h = hourInRome(d);
  if (h >= 5 && h < 13) return 'Buongiorno';
  if (h >= 13 && h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// "mercoledì 14 ottobre"
export function longDate(d = new Date()) {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

// "14:36"
export function clockTime(d = new Date()) {
  return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

// "Mercoledì 14 ottobre, ore 14:36"
export function stamp(d = new Date()) {
  return `${capitalize(longDate(d))}, ore ${clockTime(d)}`;
}

// "2026-10-14"
export function isoDay(d = new Date()) {
  return fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(d);
}

export function isWeekend(d = new Date()) {
  const wd = fmt({ weekday: 'short' }, 'en-US').format(d);
  return wd === 'Sat' || wd === 'Sun';
}
