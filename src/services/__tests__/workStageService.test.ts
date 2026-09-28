import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// La query gira sullo schema vero, in memoria: sono le sue regole — cestino,
// pagine approvate, traduzioni nate da una trascrizione — quelle da proteggere.
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('src-tauri/migrations/0001_baseline_2_0.sql', 'utf8'));

vi.mock('../dbService', () => ({
  select: vi.fn(async (sql: string) => db.prepare(sql).all()),
}));

import { stageOf, workStagesOfMany } from '../workStageService';

const run = (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).run(...params);

function source(id: string) {
  run(`INSERT INTO sources (id, title, kind) VALUES (?, ?, 'book')`, id, id);
  run(`INSERT INTO source_versions (id, source_id, label, version_kind) VALUES (?, ?, 'main', 'iiif_manifest')`, `v-${id}`, id);
}

function transcription(id: string, sourceId: string, pages: boolean[], status = 'active') {
  run(`INSERT INTO transcription_documents (id, source_version_id, workspace_id, title, status) VALUES (?, ?, 'w1', ?, ?)`,
    id, `v-${sourceId}`, id, status);
  pages.forEach((approved, position) => {
    const segment = `${id}-p${position}`;
    run(`INSERT INTO transcription_segments (id, document_id, position) VALUES (?, ?, ?)`, segment, id, position);
    if (!approved) return;
    run(`INSERT INTO transcription_revisions (id, segment_id, revision_number) VALUES (?, ?, 1)`, `${segment}-r1`, segment);
    run(`UPDATE transcription_segments SET approved_revision_id = ? WHERE id = ?`, `${segment}-r1`, segment);
  });
}

function translationOf(projectId: string, origin: { documentId?: string; sourceId?: string }, status = 'active') {
  run(`INSERT INTO projects (id, name, workspace_id, status) VALUES (?, ?, 'w1', ?)`, projectId, projectId, status);
  if (origin.documentId) {
    run(`INSERT INTO translation_origins (project_id, origin_type, transcription_document_id) VALUES (?, 'transcription', ?)`,
      projectId, origin.documentId);
  } else {
    run(`INSERT INTO translation_origins (project_id, origin_type, source_version_id) VALUES (?, 'source_level', ?)`,
      projectId, `v-${origin.sourceId}`);
  }
}

describe('workStagesOfMany', () => {
  beforeEach(() => {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['translation_origins', 'projects', 'transcription_revisions', 'transcription_segments',
      'transcription_documents', 'source_versions', 'sources']) {
      db.exec(`DELETE FROM ${table}`);
    }
    db.exec("INSERT OR IGNORE INTO workspaces (id, name) VALUES ('w1', 'Archivio')");
  });

  it('un\'opera senza lavoro non ha stato', async () => {
    source('s1');
    expect((await workStagesOfMany()).get('s1')).toBe('none');
  });

  it('una trascrizione approvata solo in parte resta in trascrizione', async () => {
    source('s1');
    transcription('d1', 's1', [true, false]);
    expect((await workStagesOfMany()).get('s1')).toBe('transcribing');
  });

  it('una trascrizione con tutte le pagine approvate è trascritta', async () => {
    source('s1');
    transcription('d1', 's1', [true, true]);
    expect((await workStagesOfMany()).get('s1')).toBe('transcribed');
  });

  it('una trascrizione senza pagine non conta come trascritta', async () => {
    source('s1');
    transcription('d1', 's1', []);
    expect((await workStagesOfMany()).get('s1')).toBe('transcribing');
  });

  it('una trascrizione nel cestino non conta', async () => {
    source('s1');
    transcription('d1', 's1', [true], 'trashed');
    expect((await workStagesOfMany()).get('s1')).toBe('none');
  });

  it('una traduzione nata da una trascrizione rende tradotta l\'opera', async () => {
    source('s1');
    transcription('d1', 's1', [false]);
    translationOf('p1', { documentId: 'd1' });
    expect((await workStagesOfMany()).get('s1')).toBe('translated');
  });

  it('una traduzione fatta direttamente sull\'opera conta, una nel cestino no', async () => {
    source('s1');
    source('s2');
    translationOf('p1', { sourceId: 's1' });
    translationOf('p2', { sourceId: 's2' }, 'trashed');

    const stages = await workStagesOfMany();

    expect(stages.get('s1')).toBe('translated');
    expect(stages.get('s2')).toBe('none');
  });
});

describe('stageOf', () => {
  it('la traduzione vince sulla trascrizione, la verifica sulla lavorazione', () => {
    expect(stageOf({ transcriptions: 2, verified: 1, translated: 1 })).toBe('translated');
    expect(stageOf({ transcriptions: 2, verified: 1, translated: 0 })).toBe('transcribed');
    expect(stageOf({ transcriptions: 1, verified: 0, translated: 0 })).toBe('transcribing');
  });
});
