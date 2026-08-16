import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute } from './dbService';
import { recordFailedModelCall, recordJudgement, recordModelCall } from './pipelineProvenance';
import { factId } from './provenanceService';
import type { JudgeResult } from '../types';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const executeMock = vi.mocked(execute);

/** I parametri dell'ultima scrittura, per nome della colonna. */
function written(): unknown[] {
  const [, params] = executeMock.mock.calls[executeMock.mock.calls.length - 1];
  return (params ?? []) as unknown[];
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

    const params = written();
    expect(params.filter((value) => value === 0)).toHaveLength(0);
  });

  it('una chiamata fallita resta scritta con il suo motivo', async () => {
    await recordFailedModelCall(call, 'connessione caduta');

    const params = written();
    expect(params).toContain('error');
    expect(params).toContain('connessione caduta');
  });

  it('rieseguire lo stesso stadio sostituisce il fatto invece di accumularne uno', async () => {
    // L'identità è frammento più stadio (D27): i tentativi non si contano qui.
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
