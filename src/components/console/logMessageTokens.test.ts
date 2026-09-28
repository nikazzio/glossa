import { describe, expect, it } from 'vitest';
import { tokenizeLogMessage } from './logMessageTokens';

describe('tokenizeLogMessage', () => {
  it('colora nomi dei campi, testi, numeri e valori di un evento', () => {
    const tokens = tokenizeLogMessage('search.page {"page":2,"hasMore":false,"provider":"gallica","next":null}');

    expect(tokens[0]).toEqual({ kind: 'text', value: 'search.page ' });
    expect(tokens).toEqual(expect.arrayContaining([
      { kind: 'key', value: '"page"' },
      { kind: 'number', value: '2' },
      { kind: 'literal', value: 'false' },
      { kind: 'string', value: '"gallica"' },
      { kind: 'literal', value: 'null' },
      { kind: 'punctuation', value: '{' },
    ]));
  });

  it('ricompone il messaggio identico, carattere per carattere', () => {
    const message = 'evento {"details":{"durationMs":3198,"text":"a \\"b\\" c"}, "list": [1, -2.5e3]}';

    expect(tokenizeLogMessage(message).map((token) => token.value).join('')).toBe(message);
  });

  it('lascia intero un messaggio senza dati o con graffe che non sono JSON', () => {
    expect(tokenizeLogMessage('job started id=42')).toEqual([{ kind: 'text', value: 'job started id=42' }]);
    expect(tokenizeLogMessage('formato {nome} non valido')).toEqual([
      { kind: 'text', value: 'formato {nome} non valido' },
    ]);
  });
});
