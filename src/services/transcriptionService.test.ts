import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute, select } from './dbService';
import {
  ensureSegment,
  manifestIndexOf,
  saveSegmentText,
  restoreRevision,
  verifySegment,
  unverifySegment,
  EVENT_VERIFIED,
  EVENT_UNVERIFIED,
} from './transcriptionService';
import { contentHash } from './provenanceService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const selectMock = vi.mocked(select);
const executeMock = vi.mocked(execute);

function writes(): Array<{ query: string; params: unknown[] }> {
  return executeMock.mock.calls.map(([query, params]) => ({
    query: query as string,
    params: (params ?? []) as unknown[],
  }));
}

function writeMatching(fragment: string) {
  return writes().find((write) => write.query.includes(fragment));
}

const ocrRevision = {
  id: 'seg1:r1',
  segment_id: 'seg1',
  revision_number: 1,
  text: 'Testo riconosciuto',
  created_by: 'ocr' as const,
  derived_from_revision_id: null,
  content_hash: contentHash('Testo riconosciuto'),
};

describe('storico delle trascrizioni', () => {
  beforeEach(() => {
    selectMock.mockReset().mockResolvedValue([]);
    executeMock.mockReset().mockResolvedValue(undefined);
  });

  it('il primo salvataggio manuale diventa la prima revisione', async () => {
    await saveSegmentText('seg1', 'Testo corretto', 'user');

    const insert = writeMatching('INSERT INTO transcription_revisions');
    expect(insert?.params).toContain('user');
    expect(insert?.params).toContain(1);
  });

  it('salvare lo stesso testo non aggiunge una revisione', async () => {
    selectMock.mockResolvedValue([ocrRevision]);

    await saveSegmentText('seg1', 'Testo riconosciuto', 'ocr');

    expect(writeMatching('INSERT INTO transcription_revisions')).toBeUndefined();
  });

  it('correggendo il testo OCR nasce una revisione utente derivata', async () => {
    selectMock.mockResolvedValue([ocrRevision]);

    await saveSegmentText('seg1', 'Testo corretto a mano', 'user');

    const insert = writeMatching('INSERT INTO transcription_revisions');
    expect(insert?.params).toContain('user');
    expect(insert?.params).toContain(2);
    expect(insert?.params).toContain('seg1:r1');
  });

  it('verificare il segmento punta l approvazione all ultima revisione', async () => {
    selectMock.mockResolvedValue([ocrRevision]);

    await verifySegment('seg1', 'w1');

    expect(writeMatching('UPDATE transcription_segments SET approved_revision_id')?.params).toEqual([
      'seg1',
      'seg1:r1',
    ]);
    expect(writeMatching('INSERT INTO provenance_events')?.params).toContain(EVENT_VERIFIED);
  });

  it('verificare senza nessuna revisione fallisce', async () => {
    selectMock.mockResolvedValue([]);

    await expect(verifySegment('seg1', 'w1')).rejects.toThrow('transcription.noRevisionToVerify');
  });

  it('ritirare la verifica non cancella la revisione', async () => {
    selectMock.mockResolvedValue([{ approved_revision_id: 'seg1:r1' }]);

    await unverifySegment('seg1', 'w1');

    expect(writeMatching('DELETE FROM transcription_revisions')).toBeUndefined();
    expect(
      writeMatching('UPDATE transcription_segments SET approved_revision_id = NULL')?.params,
    ).toEqual(['seg1']);
    expect(writeMatching('INSERT INTO provenance_events')?.params).toContain(EVENT_UNVERIFIED);
  });

  it('restore di una revisione inesistente fallisce', async () => {
    selectMock.mockResolvedValue([]);

    await expect(restoreRevision('seg1', 'seg1:r9')).rejects.toThrow(
      'transcription.revisionNotFound',
    );
  });

  it('restore scrive una revisione nuova con il testo di quella vecchia', async () => {
    const oldRevision = { ...ocrRevision, id: 'seg1:r1' };
    const currentRevision = {
      ...ocrRevision,
      id: 'seg1:r2',
      revision_number: 2,
      text: 'Testo corretto',
      content_hash: contentHash('Testo corretto'),
    };
    selectMock
      .mockResolvedValueOnce([oldRevision]) // lettura della revisione bersaglio
      .mockResolvedValueOnce([currentRevision]); // ultima revisione, per il numero successivo

    await restoreRevision('seg1', 'seg1:r1');

    const insert = writeMatching('INSERT INTO transcription_revisions');
    expect(insert?.params).toContain('Testo riconosciuto');
    expect(insert?.params).toContain(3);
    expect(insert?.params).toContain('seg1:r2');
  });

  it('un salvataggio concorrente non scarta il testo che arriva secondo', async () => {
    const winner = {
      ...ocrRevision,
      created_by: 'user' as const,
      text: 'Testo del salvataggio che ha vinto',
      content_hash: contentHash('Testo del salvataggio che ha vinto'),
    };
    const retried = {
      ...winner,
      id: 'seg1:r2',
      revision_number: 2,
      text: 'Testo nostro, conservato nella revisione successiva',
      content_hash: contentHash('Testo nostro, conservato nella revisione successiva'),
      derived_from_revision_id: winner.id,
    };
    executeMock
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
      .mockResolvedValueOnce(undefined);
    selectMock
      .mockResolvedValueOnce([]) // latestRevision: nessuna revisione precedente, stesso punto di partenza dei due salvataggi
      .mockResolvedValueOnce([winner]); // nuova ultima revisione da cui ripartire

    const result = await saveSegmentText('seg1', retried.text, 'user');

    expect(result).toMatchObject(retried);
    const inserts = writes().filter((write) => write.query.includes('INSERT INTO transcription_revisions'));
    expect(inserts).toHaveLength(2);
    expect(inserts[1].params).toContain(2);
    expect(inserts[1].params).toContain(winner.id);
  });

  it('restore della revisione già corrente non aggiunge nulla', async () => {
    selectMock.mockResolvedValueOnce([ocrRevision]).mockResolvedValueOnce([ocrRevision]);

    await restoreRevision('seg1', 'seg1:r1');

    expect(writeMatching('INSERT INTO transcription_revisions')).toBeUndefined();
  });
});

describe('collegamento fra pagina dello Studio e pagina del libro', () => {
  beforeEach(() => {
    selectMock.mockReset().mockResolvedValue([]);
    executeMock.mockReset().mockResolvedValue(undefined);
  });

  const document = { id: 'td1', source_version_id: 'v1' };

  function sourcePageLookup() {
    return selectMock.mock.calls.find(([query]) => String(query).includes('FROM source_pages'));
  }

  it('la copertina è la pagina 1 del libro: lo Studio conta da 0, il libro da 1', () => {
    expect(manifestIndexOf(0)).toBe(1);
    expect(manifestIndexOf(8)).toBe(9);
  });

  it('la nona pagina dello Studio si collega alla nona pagina del libro, non all ottava', async () => {
    selectMock
      .mockResolvedValueOnce([]) // nessun segmento a quella posizione
      .mockResolvedValueOnce([document])
      .mockResolvedValueOnce([{ id: 'spg-9' }]);

    const segment = await ensureSegment('td1', 8, '3');

    expect(sourcePageLookup()?.[1]).toEqual(['v1', 9]);
    expect(segment.source_page_id).toBe('spg-9');
  });

  it('un collegamento sbagliato già salvato si corregge al tocco successivo', async () => {
    const wrong = {
      id: 'ts1', document_id: 'td1', position: 8, label: '3',
      source_page_id: 'spg-8', approved_revision_id: null,
    };
    selectMock
      .mockResolvedValueOnce([wrong])
      .mockResolvedValueOnce([document])
      .mockResolvedValueOnce([{ id: 'spg-9' }]);

    const segment = await ensureSegment('td1', 8, '3');

    expect(segment.source_page_id).toBe('spg-9');
    expect(writeMatching('UPDATE transcription_segments')?.params).toEqual(['ts1', '3', 'spg-9']);
  });

  it('una copia mai scaricata non cancella un collegamento già presente', async () => {
    const linked = {
      id: 'ts1', document_id: 'td1', position: 8, label: '3',
      source_page_id: 'spg-9', approved_revision_id: null,
    };
    selectMock
      .mockResolvedValueOnce([linked])
      .mockResolvedValueOnce([document])
      .mockResolvedValueOnce([]);

    const segment = await ensureSegment('td1', 8, '3');

    expect(segment.source_page_id).toBe('spg-9');
    expect(writeMatching('UPDATE transcription_segments')).toBeUndefined();
  });
});
