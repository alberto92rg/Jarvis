// Gmail in sola lettura.
import { gfetch } from './google.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function header(headers, name) {
  const h = headers?.find((x) => x.name.toLowerCase() === name);
  return h ? h.value : '';
}

function b64uDecode(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  t += '='.repeat((4 - (t.length % 4)) % 4);
  const bin = atob(t);
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function findPart(payload, mime) {
  if (!payload) return null;
  if (payload.mimeType === mime && payload.body?.data) return payload.body.data;
  for (const p of payload.parts || []) {
    const r = findPart(p, mime);
    if (r) return r;
  }
  return null;
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style,script,head').forEach((n) => n.remove());
  return doc.body?.textContent || '';
}

function decodeEntities(s = '') {
  return new DOMParser().parseFromString(`<p>${s}</p>`, 'text/html').body.textContent || '';
}

// Toglie le citazioni dei messaggi precedenti, che allungano senza informare.
function cleanBody(text) {
  const out = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const t = line.trim();
    if (/^>/.test(t)) continue;
    if (/^(Il giorno|On) .{5,200}(ha scritto|wrote):?$/i.test(t)) break;
    if (/^-{2,}\s*(Messaggio originale|Original Message)/i.test(t)) break;
    if (/^(Da|From):\s.+/i.test(t) && out.length > 3) break;
    out.push(line);
  }
  return out.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function bodyText(payload, limit) {
  const plain = findPart(payload, 'text/plain');
  let t = plain ? b64uDecode(plain) : '';
  if (!t.trim()) {
    const html = findPart(payload, 'text/html');
    if (html) t = htmlToText(b64uDecode(html));
  }
  const clean = cleanBody(t);
  return clean.length > limit ? clean.slice(0, limit) + '…' : clean;
}

export function addresses(str) {
  return (String(str).match(EMAIL_RE) || []).map((a) => a.toLowerCase());
}

export async function listMessages(q, max = 20, { bodyLimit = 1500 } = {}) {
  const list = await gfetch(`${API}/messages`, { q, maxResults: max });
  const ids = (list.messages || []).map((m) => m.id);
  const full = await Promise.all(ids.map((id) => gfetch(`${API}/messages/${id}`, { format: 'full' })));
  return full
    .map((m) => {
      const h = m.payload?.headers || [];
      const labels = m.labelIds || [];
      return {
        id: m.id,
        data: new Date(Number(m.internalDate)).toISOString(),
        da: header(h, 'from'),
        a: header(h, 'to'),
        cc: header(h, 'cc') || undefined,
        oggetto: header(h, 'subject') || '(senza oggetto)',
        inviataDaLei: labels.includes('SENT'),
        nonLetta: labels.includes('UNREAD'),
        allegati: (m.payload?.parts || []).some((p) => p.filename) || undefined,
        testo: bodyText(m.payload, bodyLimit) || decodeEntities(m.snippet),
      };
    })
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}

// Solo posta in arrivo: messaggi nella casella "In arrivo" scritti dai clienti.
export async function fetchClientMail(clients, sinceMs) {
  const from = clients.map((c) => `from:${c.email}`).join(' ');
  const q = `in:inbox {${from}} after:${Math.floor(sinceMs / 1000)}`;
  const msgs = (await listMessages(q, 20)).filter((m) => !m.inviataDaLei);
  const sender = (m) => addresses(m.da)[0] || '';
  const messaggi = msgs
    .map((m) => {
      const c = clients.find((x) => x.email === sender(m));
      return c ? { cliente: c.name, data: m.data, oggetto: m.oggetto, nonLetta: m.nonLetta, allegati: m.allegati, testo: m.testo } : null;
    })
    .filter(Boolean);
  return {
    totale: messaggi.length,
    perCliente: clients.map((c) => ({ cliente: c.name, nuove: messaggi.filter((m) => m.cliente === c.name).length })),
    messaggi,
  };
}

// Le ricerche restano sempre nella posta in arrivo.
export function inboxQuery(q) {
  const cleaned = String(q || '')
    .replace(/(^|\s)-?(in|label):\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `in:inbox ${cleaned}`.trim();
}

export function searchMail(q, max = 5) {
  return listMessages(inboxQuery(q), max, { bodyLimit: 700 });
}
