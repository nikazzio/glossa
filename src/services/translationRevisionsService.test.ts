import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute, select } from './dbService';
import {
  approveTranslation,
  recordModelRevision,
  withdrawTranslationApproval,
  EVENT_APPROVED,
  EVENT_WITHDRAWN,
} from './translationRevisionsService';
import { contentHash, factId } from './provenanceService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const selectMock = vi.mocked(select);
const executeMock = vi.mocked(execute);

/** Le query di scrittura, nell'ordine in cui sono state eseguite. */
function writes(): Array<{ query: string; params: unknown[] }> {
  return executeMock.mock.calls.map(([query, params]) => ({
    query: query as string,
    params: (params ?? []) as unknown[],
  }));
}

function writeMatching(fragment: string) {
  return writes().find((write) => write.query.includes(fragment));
}

const modelRevision = {
  id: 'c1:r1',
  translation_id: 'c1',
  revision_number: 1,
  text: 'Beato l uomo',
  created_by: 'model' as const,
  derived_from_revision_id: null,
  content_hash: contentHash('Beato l uomo'),
};

describe('storico delle traduzioni', () => {
  beforeEach(() => {
    selectMock.mockReset().mockResolvedValue([]);
    executeMock.mockReset().mockResolvedValue(undefined);
  });

  it('la proposta del modello diventa la prima revisione', async () => {
    await recordModelRevision('c1', 'Beato l uomo');

    const insert = writeMatching('INSERT INTO translation_revisions');
    expect(insert?.params).toContain('model');
    expect(insert?.params).toContain(1);
  });

  it('rieseguire la pipeline con lo stesso risultato non aggiunge una revisione', async () => {
    // Una riesecuzione che produce lo stesso testo non è un momento diverso.
    selectMock.mockResolvedValue([modelRevision]);

    await recordModelRevision('c1', 'Beato l uomo');

    expect(writeMatching('INSERT INTO translation_revisions')).toBeUndefined();
  });

  it('una traduzione vuota non è una proposta', async () => {
    await recordModelRevision('c1', '   ');

    expect(executeMock).not.toHaveBeenCalled();
  });

  it('approvando un testo diverso nasce una revisione umana derivata da quella del modello', async () => {
    selectMock.mockResolvedValue([modelRevision]);

    await approveTranslation('c1', 'Beato l uomo che non segue', 'w1');

    const insert = writeMatching('INSERT INTO translation_revisions');
    expect(insert?.params).toContain('human');
    expect(insert?.params).toContain(2);
    // Da qui la coppia proposta/approvata è ricostruibile per intero.
    expect(insert?.params).toContain('c1:r1');
  });

  it('approvando senza cambiare niente il fatto si registra lo stesso', async () => {
    // Accettare è un giudizio: registrare solo le correzioni produrrebbe un
    // insieme sbilanciato verso gli errori.
    selectMock.mockResolvedValue([modelRevision]);

    await approveTranslation('c1', 'Beato l uomo', 'w1');

    expect(writeMatching('INSERT INTO translation_revisions')).toBeUndefined();
    const fact = writeMatching('INSERT INTO provenance_events');
    expect(fact?.params).toContain(EVENT_APPROVED);
  });

  it('approvare due revisioni diverse lascia due fatti distinti', async () => {
    // Senza la revisione nell'identità, approvare la seconda sostituirebbe la
    // storia della prima invece di continuarla.
    const first = factId({
      eventType: EVENT_APPROVED,
      entityType: 'translation_chunk',
      entityId: 'c1',
      actor: 'user',
      keyRef: 'c1:r1',
    });
    const second = factId({
      eventType: EVENT_APPROVED,
      entityType: 'translation_chunk',
      entityId: 'c1',
      actor: 'user',
      keyRef: 'c1:r2',
    });

    expect(first).not.toBe(second);
  });

  it('lo stato corrente punta alla revisione approvata adesso', async () => {
    selectMock.mockResolvedValue([modelRevision]);

    await approveTranslation('c1', 'Beato l uomo', 'w1');

    expect(writeMatching('UPDATE translations SET approved_revision_id')?.params).toEqual([
      'c1',
      'c1:r1',
    ]);
  });

  it('ritirare l approvazione non cancella la revisione', async () => {
    selectMock.mockResolvedValue([{ approved_revision_id: 'c1:r1' }]);

    await withdrawTranslationApproval('c1', 'w1');

    expect(writeMatching('DELETE FROM translation_revisions')).toBeUndefined();
    expect(writeMatching('UPDATE translations SET approved_revision_id = NULL')?.params).toEqual([
      'c1',
    ]);
    expect(writeMatching('INSERT INTO provenance_events')?.params).toContain(EVENT_WITHDRAWN);
  });
});
