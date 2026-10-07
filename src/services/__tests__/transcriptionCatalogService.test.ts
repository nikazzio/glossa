import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SOURCE_FIELDS, type LibraryCatalogEntry } from '../../types';

// La query gira sullo schema vero, in memoria: il conteggio delle pagine
// scritte deve guardare l'ultima versione di ogni pagina, non una qualsiasi.
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('src-tauri/migrations/0001_baseline_2_0.sql', 'utf8'));

vi.mock('../dbService', () => ({
  select: vi.fn(async (sql: string) => db.prepare(sql).all()),
}));

const libraryWork = (id: string) => ({
  source: { id, title: `Opera ${id}`, kind: 'print', primaryLanguage: null, externalRef: null,
    status: 'active', archivedAt: null, createdAt: '2026-01-01 10:00:00' },
  fields: EMPTY_SOURCE_FIELDS,
}) as unknown as LibraryCatalogEntry;

vi.mock('../libraryService', () => ({
  listLibraryCatalog: vi.fn(async () => [libraryWork('s1')]),
}));

import { listTranscriptionCatalog } from '../transcriptionCatalogService';

const run = (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).run(...params);

function revision(segment: string, number: number, text: string, createdAt: string) {
  run(`INSERT INTO transcription_revisions (id, segment_id, revision_number, text, created_at) VALUES (?, ?, ?, ?, ?)`,
    `${segment}-r${number}`, segment, number, text, createdAt);
}

describe('listTranscriptionCatalog', () => {
  beforeEach(() => {
    db.exec(`DELETE FROM transcription_revisions; DELETE FROM transcription_segments;
      DELETE FROM transcription_documents; DELETE FROM source_versions; DELETE FROM sources;`);
    db.exec("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES ('w1', 'Archivio', '2026-01-01')");
    run(`INSERT INTO sources (id, title, kind) VALUES ('s1', 'Opera s1', 'book')`);
    run(`INSERT INTO source_versions (id, source_id, label, version_kind) VALUES ('v1', 's1', 'main', 'iiif_manifest')`);
  });

  it('counts the pages whose latest version has text and the verified ones', async () => {
    run(`INSERT INTO transcription_documents (id, source_version_id, workspace_id, title, created_at)
         VALUES ('d1', 'v1', 'w1', 'Duello', '2026-01-01 10:00:00')`);
    ['p0', 'p1', 'p2'].forEach((segment, position) =>
      run(`INSERT INTO transcription_segments (id, document_id, position) VALUES (?, 'd1', ?)`, segment, position));
    revision('p0', 1, 'testo', '2026-09-01 10:00:00');
    // Una pagina svuotata: la versione vecchia aveva testo, l'ultima no.
    revision('p1', 1, 'prima', '2026-09-02 10:00:00');
    revision('p1', 2, '  ', '2026-09-03 10:00:00');
    run(`UPDATE transcription_segments SET approved_revision_id = 'p0-r1' WHERE id = 'p0'`);

    const [entry] = await listTranscriptionCatalog();
    expect(entry.pagesWithText).toBe(1);
    expect(entry.verifiedPages).toBe(1);
    expect(entry.lastEditedAt).toBe('2026-09-03 10:00:00');
    expect(entry.work?.source.id).toBe('s1');
  });

  it('leaves out deleted transcriptions and keeps the ones without a work', async () => {
    run(`INSERT INTO transcription_documents (id, workspace_id, title, created_at) VALUES ('d1', 'w1', 'Appunti', '2026-02-01 10:00:00')`);
    run(`INSERT INTO transcription_documents (id, workspace_id, title, status) VALUES ('d2', 'w1', 'Vecchia', 'trashed')`);
    run(`INSERT INTO transcription_documents (id, workspace_id, title, status) VALUES ('d3', 'w1', 'Riposta', 'archived')`);

    const entries = await listTranscriptionCatalog();
    expect(entries.map((item) => item.document.id)).toEqual(['d1', 'd3']);
    expect(entries[0].work).toBeNull();
    expect(entries[0].lastEditedAt).toBe('2026-02-01 10:00:00');
  });
});
