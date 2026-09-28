/** Parti di un messaggio di log, per colorarne i dati come in un editor. */
export type LogTokenKind = 'text' | 'key' | 'string' | 'number' | 'literal' | 'punctuation';

export interface LogToken {
  kind: LogTokenKind;
  value: string;
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:]/g;

function jsonKindOf(match: RegExpExecArray): LogTokenKind {
  if (match[1] !== undefined) return match[2] !== undefined ? 'key' : 'string';
  const value = match[0];
  if (value === 'true' || value === 'false' || value === 'null') return 'literal';
  if (/^[{}[\],:]$/.test(value)) return 'punctuation';
  return 'number';
}

function tokenizeJson(json: string): LogToken[] {
  const tokens: LogToken[] = [];
  let cursor = 0;
  for (const match of json.matchAll(JSON_TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) tokens.push({ kind: 'text', value: json.slice(cursor, start) });
    // La chiave si colora senza i due punti, che restano punteggiatura.
    if (match[1] !== undefined && match[2] !== undefined) {
      tokens.push({ kind: 'key', value: match[1] });
      tokens.push({ kind: 'punctuation', value: match[2] });
    } else {
      tokens.push({ kind: jsonKindOf(match), value: match[0] });
    }
    cursor = start + match[0].length;
  }
  if (cursor < json.length) tokens.push({ kind: 'text', value: json.slice(cursor) });
  return tokens;
}

/**
 * Divide un messaggio in testo libero e dati. I dati sono l'oggetto JSON che
 * il programma accoda al nome dell'evento; se non c'è, o non è JSON valido,
 * il messaggio resta un pezzo solo di testo.
 */
export function tokenizeLogMessage(message: string): LogToken[] {
  const start = message.indexOf('{');
  if (start < 0) return [{ kind: 'text', value: message }];
  const json = message.slice(start);
  try {
    JSON.parse(json);
  } catch {
    return [{ kind: 'text', value: message }];
  }
  const prefix = message.slice(0, start);
  return [...(prefix ? [{ kind: 'text' as const, value: prefix }] : []), ...tokenizeJson(json)];
}
