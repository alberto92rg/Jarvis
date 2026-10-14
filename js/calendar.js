// Google Calendar in sola lettura (calendario principale).
import { gfetch } from './google.js';
import { clockTime, longDate } from './util.js';

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export function dayRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

export async function eventsBetween(start, end) {
  const r = await gfetch(API, {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: 50,
    timeZone: 'Europe/Rome',
  });
  return (r.items || [])
    .filter((e) => e.status !== 'cancelled')
    .filter((e) => (e.attendees || []).find((a) => a.self)?.responseStatus !== 'declined')
    .map((e) => {
      const allDay = !e.start?.dateTime;
      const s = new Date(e.start?.dateTime || `${e.start?.date}T00:00:00`);
      const f = new Date(e.end?.dateTime || `${e.end?.date}T00:00:00`);
      const video =
        e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri;
      return {
        titolo: e.summary || '(senza titolo)',
        giorno: longDate(s),
        orario: allDay ? 'tutto il giorno' : `${clockTime(s)}-${clockTime(f)}`,
        tuttoIlGiorno: allDay,
        inizio: s.toISOString(),
        fine: f.toISOString(),
        luogo: e.location || undefined,
        link: video || undefined,
      };
    });
}

// Sovrapposizioni e impegni a meno di 15 minuti l'uno dall'altro.
export function scheduleNotes(events) {
  const timed = events
    .filter((e) => !e.tuttoIlGiorno)
    .map((e) => ({ ...e, s: new Date(e.inizio), f: new Date(e.fine) }))
    .sort((a, b) => a.s - b.s);
  const notes = [];
  for (let i = 1; i < timed.length; i++) {
    const a = timed[i - 1];
    const b = timed[i];
    if (b.s < a.f) notes.push(`Sovrapposizione tra "${a.titolo}" e "${b.titolo}"`);
    else if (b.s - a.f < 15 * 60e3) notes.push(`Meno di 15 minuti tra "${a.titolo}" e "${b.titolo}"`);
  }
  return notes;
}
