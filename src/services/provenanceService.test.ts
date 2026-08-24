import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute } from './dbService';
import { contentHash, factId, recordFact } from './provenanceService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const executeMock = vi.mocked(execute);

const fact = {
  eventType: 'translation.approved',
  entityType: 'translation_chunk' as const,
  entityId: 'c1',
  actor: 'user' as const,
};

describe('registro dei fatti', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(undefined);
  });

  it('lo stesso fatto ha sempre lo stesso identificativo', async () => {
    // Riscriverlo sostituisce invece di duplicare: senza, un lavoro ritentato
    // conterebbe tre volte quello che ha fatto una sola.
    expect(factId(fact)).toBe(factId({ ...fact }));
  });

  it('fatti diversi sulla stessa entità restano distinti', () => {
    expect(factId(fact)).not.toBe(factId({ ...fact, eventType: 'translation.approval_withdrawn' }));
    expect(factId(fact)).not.toBe(factId({ ...fact, keyRef: 'c1:r2' }));
  });

  it('l impronta del contenuto è stabile e cambia con il testo', () => {
    // Il riferimento dice cosa c'è adesso, l'impronta cosa c'era allora.
    expect(contentHash('Beatus vir')).toBe(contentHash('Beatus vir'));
    expect(contentHash('Beatus vir')).not.toBe(contentHash('Beatus vir.'));
    expect(contentHash('')).toHaveLength(16);
  });

  it('l impronta è la stessa che calcola il backend', () => {
    // Le due parti scrivono nella stessa tabella: due impronte diverse per lo
    // stesso testo renderebbero il registro inconfrontabile con sé stesso.
    // Valori attesi: FNV-1a a 64 bit, la stessa funzione di `provenance.rs`.
    expect(contentHash('a')).toBe('af63dc4c8601ec8c');
    expect(contentHash('Beatus vir')).toBe('63e883125746c558');
  });

  it('scrive tutte le colonne che l area Analisi raggrupperà', async () => {
    await recordFact({
      ...fact,
      model: 'claude-opus-5',
      provider: 'anthropic',
      inputTokens: 1200,
      outputTokens: 800,
      estimatedCost: 0.42,
      sourceLanguage: 'la',
      targetLanguage: 'it',
    });

    const [, params] = executeMock.mock.calls[0];
    expect(params).toContain('claude-opus-5');
    expect(params).toContain(1200);
    expect(params).toContain(0.42);
    expect(params).toContain('la');
  });
});
