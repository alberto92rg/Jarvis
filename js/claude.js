// Chiamate alla Claude API direttamente dal telefono, con la chiave del signore.
import { getSettings } from './store.js';
import { JarvisError, NeedsGoogleAuth } from './errors.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

function explain(status, msg) {
  if (/credit balance/i.test(msg)) return 'Credito API esaurito: lo ricarichi su console.anthropic.com.';
  if (status === 401) return 'La chiave API Anthropic non è valida. La controlli nelle impostazioni.';
  if (status === 403) return 'La chiave API Anthropic non ha i permessi necessari.';
  if (status === 404) return `Modello non disponibile${msg ? ': ' + msg : ''}.`;
  if (status === 429) return 'Troppe richieste a Claude in poco tempo. Riprovi tra un minuto.';
  if (status === 529 || status === 503) return 'I server di Claude sono sovraccarichi. Riprovi tra poco.';
  return `Claude ha risposto con un errore (${status})${msg ? ': ' + msg : ''}.`;
}

// system: stringa, oppure [parte stabile, parte variabile]. La parte stabile va in cache.
export async function callClaude({ system, messages, tools, toolChoice, schema, maxTokens = 1200 }) {
  const { anthropicKey, model } = getSettings();
  if (!anthropicKey) throw new JarvisError('Manca la chiave API Anthropic nelle impostazioni.');
  const parts = Array.isArray(system) ? system : [system];
  const body = {
    model,
    max_tokens: maxTokens,
    system: parts
      .filter(Boolean)
      .map((text, i) => (i === 0 ? { type: 'text', text, cache_control: { type: 'ephemeral' } } : { type: 'text', text })),
    messages,
  };
  if (tools?.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  // Risposta in JSON garantito dallo schema (structured outputs).
  if (schema) body.output_config = { format: { type: 'json_schema', schema } };
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new JarvisError('Non riesco a raggiungere Claude: controlli la connessione.');
  }
  if (!r.ok) {
    let msg = '';
    try {
      msg = (await r.json()).error?.message || '';
    } catch {
      /* risposta non JSON */
    }
    throw new JarvisError(explain(r.status, msg));
  }
  return r.json();
}

export function textOf(resp) {
  return (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// Ciclo con strumenti: Claude chiede dati, l'app li legge e glieli restituisce.
export async function runAgent({ system, messages, tools, handlers, onTool, maxSteps = 6, maxTokens = 800 }) {
  const convo = [...messages];
  for (let step = 0; step < maxSteps; step++) {
    const resp = await callClaude({ system, messages: convo, tools, maxTokens });
    if (resp.stop_reason !== 'tool_use') return textOf(resp);
    convo.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
      onTool?.(block.name);
      try {
        const handler = handlers[block.name];
        if (!handler) throw new JarvisError(`Strumento sconosciuto: ${block.name}`);
        const out = await handler(block.input || {});
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (e) {
        if (e instanceof NeedsGoogleAuth) throw e;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: e.message || String(e), is_error: true });
      }
    }
    convo.push({ role: 'user', content: results });
  }
  return 'Ho dovuto interrompere la ricerca, signore: troppi passaggi. Se riformula la domanda, riprovo.';
}
