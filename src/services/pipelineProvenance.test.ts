import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute } from './dbService';
import {
  classify,
  recordFailedModelCall,
  recordJudgement,
  recordModelCall,
} from './pipelineProvenance';
import { factId } from './provenanceService';
import type { JudgeResult } from '../types';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const executeMock = vi.mocked(execute);

/** I parametri dell'ultima scrittura. */
function written(): unknown[] {
  const [, params] = executeMock.mock.calls[executeMock.mock.calls.length - 1];
  return (params ?? []) as unknown[];
}

/** Il valore scritto in una colonna, cercato per nome invece che per posizione. */
function valueOf(column: string): unknown {
  const [query, params] = executeMock.mock.calls[executeMock.mock.calls.length - 1];
  const columns = String(query)
    .match(/\(([^)]+)\) VALUES/)![1]
    .split(',')
    .map((name) => name.trim());
  return (params as unknown[])[columns.indexOf(column)];
}

const call = {
  chunkId: 'chunk-1',
  stageId: 'stage-translate',
  stageName: 'Traduzione',
  provider: 'anthropic',
  model: 'claude-opus-5',
  durationMs: 4_200,
  sourceLanguage: 'la',
  targetLanguage: 'it',
};

describe('quello che resta di una chiamata a un modello', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(undefined);
  });

  it('rieseguendo con un altro modello, il fatto racconta la chiamata nuova', async () => {
    // Sostituire solo una parte lasciava il modello di prima accanto ai token
    // nuovi: un fatto che descrive una chiamata mai avvenuta.
    await recordModelCall({ ...call, usage: { inputTokens: 10, outputTokens: 5 } });
    const [query] = executeMock.mock.calls[0];
    const upsert = String(query).split('DO UPDATE SET')[1];

    for (const column of [
      'provider',
      'model',
      'input_tokens',
      'output_tokens',
      'estimated_cost',
      'source_language',
      'error_kind',
      'workspace_id',
    ]) {
      expect(upsert).toContain(`${column}`);
    }
  });

  it('registra token, durata, modello e coppia linguistica', async () => {
    await recordModelCall({
      ...call,
      usage: { inputTokens: 1_200, outputTokens: 800, cachedInputTokens: 400 },
      input: 'Beatus vir',
      output: 'Beato l uomo',
    });

    const params = written();
    expect(params).toContain('anthropic');
    expect(params).toContain('claude-opus-5');
    expect(params).toContain(1_200);
    expect(params).toContain(800);
    expect(params).toContain(400);
    expect(params).toContain(4_200);
    expect(params).toContain('la');
    expect(params).toContain('it');
  });

  it('senza token dichiarati non ne inventa, e nemmeno un costo', async () => {
    // Zero direbbe «non è costato niente», che è un'altra cosa da «non lo so».
    await recordModelCall(call);

    expect(valueOf('input_tokens')).toBeNull();
    expect(valueOf('output_tokens')).toBeNull();
    expect(valueOf('cached_tokens')).toBeNull();
    expect(valueOf('estimated_cost')).toBeNull();
  });

  it('una chiamata fallita resta scritta con il **tipo** di errore', async () => {
    // La colonna serve a raggruppare: «quante sono cadute per i limiti del
    // provider» ha una risposta, «quante volte è comparso questo messaggio»
    // no, perché il messaggio cambia con il provider e con la giornata.
    await recordFailedModelCall(call, 'Request failed: 429 Too Many Requests');

    const params = written();
    expect(params).toContain('error');
    expect(params).toContain('rateLimited');
    expect(params).not.toContain('Request failed: 429 Too Many Requests');
  });

  it('classifica gli errori che capitano davvero', () => {
    expect(classify('fetch failed: ECONNRESET')).toBe('transport');
    expect(classify('401 Unauthorized: invalid api key')).toBe('auth');
    expect(classify('Unexpected token < in JSON at position 0')).toBe('format');
    expect(classify('503 Service Unavailable')).toBe('providerDown');
    expect(classify('qualcosa di mai visto')).toBe('unknown');
  });

  it('rieseguire lo stesso stadio sostituisce il fatto invece di accumularne uno', async () => {
    // L'identità è frammento più stadio: i tentativi non si contano qui.
    const first = factId({
      eventType: 'model.call',
      entityType: 'translation_chunk',
      entityId: 'chunk-1',
      actor: 'model',
      keyRef: 'stage-translate',
    });
    const second = factId({
      eventType: 'model.call',
      entityType: 'translation_chunk',
      entityId: 'chunk-1',
      actor: 'model',
      keyRef: 'stage-review',
    });

    expect(first).not.toBe(second);
  });

  it('il giudizio si lega alla revisione che ha giudicato', async () => {
    const judge: JudgeResult = {
      content: '',
      status: 'completed',
      rating: 'good',
      issues: [
        { type: 'glossary', severity: 'medium', description: 'termine fuori glossario' },
        { type: 'glossary', severity: 'low', description: 'altro termine' },
      ],
    };

    await recordJudgement('chunk-1', 'chunk-1:r2', judge, 'ws-1');

    const params = written();
    expect(params).toContain('translation.judged');
    expect(params).toContain('chunk-1:r2');
    expect(params).toContain('good');
    // I tipi di problema si raggruppano; il testo no, sta altrove.
    expect(params.some((value) => typeof value === 'string' && value.includes('"issues":2'))).toBe(true);
  });
});
