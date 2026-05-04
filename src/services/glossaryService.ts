import Papa from 'papaparse';
import { select, execute, runInTransaction } from './dbService';
import type { Glossary, GlossaryEntry } from '../types';
import { generateId } from '../utils';

interface GlossaryRow {
  id: string;
  name: string;
  description: string;
  source_language: string;
  target_language: string;
  created_at: string;
}

interface GlossaryEntryRow {
  id: string;
  glossary_id: string;
  term: string;
  translation: string;
  notes: string;
}

function rowToGlossary(row: GlossaryRow): Glossary {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    createdAt: row.created_at,
  };
}

function rowToEntry(row: GlossaryEntryRow): GlossaryEntry {
  return {
    id: row.id,
    term: row.term,
    translation: row.translation,
    notes: row.notes || undefined,
  };
}

export async function listGlossaries(): Promise<Glossary[]> {
  const rows = await select<GlossaryRow>(
    'SELECT id, name, description, source_language, target_language, created_at FROM glossaries ORDER BY name ASC',
  );
  return rows.map(rowToGlossary);
}

export async function createGlossary(
  name: string,
  description = '',
  sourceLang = '',
  targetLang = '',
): Promise<string> {
  const id = generateId('gls');
  await execute(
    'INSERT INTO glossaries (id, name, description, source_language, target_language) VALUES ($1, $2, $3, $4, $5)',
    [id, name, description, sourceLang, targetLang],
  );
  return id;
}

export async function renameGlossary(id: string, name: string): Promise<void> {
  await execute('UPDATE glossaries SET name = $1 WHERE id = $2', [name, id]);
}

export async function deleteGlossary(id: string): Promise<void> {
  await execute('DELETE FROM glossaries WHERE id = $1', [id]);
}

export async function getGlossaryEntries(glossaryId: string): Promise<GlossaryEntry[]> {
  const rows = await select<GlossaryEntryRow>(
    'SELECT id, glossary_id, term, translation, notes FROM glossary_entries WHERE glossary_id = $1 ORDER BY term ASC',
    [glossaryId],
  );
  return rows.map(rowToEntry);
}

export async function upsertGlossaryEntries(
  glossaryId: string,
  entries: GlossaryEntry[],
): Promise<void> {
  const validEntries = entries.filter(
    (e) => e.term.trim() && e.translation.trim(),
  );
  await runInTransaction(async (run) => {
    for (const entry of validEntries) {
      const id = entry.id ?? generateId('gle');
      await run(
        `INSERT INTO glossary_entries (id, glossary_id, term, translation, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
           term = excluded.term,
           translation = excluded.translation,
           notes = excluded.notes`,
        [id, glossaryId, entry.term, entry.translation, entry.notes ?? ''],
      );
    }
    const keptIds = validEntries.filter((e) => e.id).map((e) => e.id as string);
    if (keptIds.length > 0) {
      const placeholders = keptIds.map((_, i) => `$${i + 2}`).join(', ');
      await run(
        `DELETE FROM glossary_entries WHERE glossary_id = $1 AND id NOT IN (${placeholders})`,
        [glossaryId, ...keptIds],
      );
    } else {
      await run('DELETE FROM glossary_entries WHERE glossary_id = $1', [glossaryId]);
    }
  });
}

export async function forkGlossary(id: string, newName: string): Promise<string> {
  const newId = generateId('gls');
  await runInTransaction(async (run) => {
    await run(
      `INSERT INTO glossaries (id, name, description, source_language, target_language)
       SELECT $1, $2, description, source_language, target_language FROM glossaries WHERE id = $3`,
      [newId, newName, id],
    );
    const entries = await select<GlossaryEntryRow>(
      'SELECT id, glossary_id, term, translation, notes FROM glossary_entries WHERE glossary_id = $1',
      [id],
    );
    for (const entry of entries) {
      await run(
        'INSERT INTO glossary_entries (id, glossary_id, term, translation, notes) VALUES ($1, $2, $3, $4, $5)',
        [generateId('gle'), newId, entry.term, entry.translation, entry.notes],
      );
    }
  });
  return newId;
}

export async function assignGlossaryToProject(
  projectId: string,
  glossaryId: string | null,
): Promise<void> {
  await runInTransaction(async (run) => {
    await run('DELETE FROM project_glossaries WHERE project_id = $1', [projectId]);
    if (glossaryId) {
      await run(
        'INSERT INTO project_glossaries (project_id, glossary_id) VALUES ($1, $2)',
        [projectId, glossaryId],
      );
    }
  });
}

export async function getProjectGlossaryId(projectId: string): Promise<string | null> {
  const rows = await select<{ glossary_id: string }>(
    'SELECT glossary_id FROM project_glossaries WHERE project_id = $1 LIMIT 1',
    [projectId],
  );
  return rows[0]?.glossary_id ?? null;
}

export async function importEntriesFromCsv(
  glossaryId: string,
  csvText: string,
  strategy: 'replace' | 'merge',
): Promise<number> {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const termKeys = ['term', 'source', 'from', 'termine', 'sorgente'];
  const transKeys = ['translation', 'target', 'to', 'traduzione', 'destinazione'];
  const notesKeys = ['notes', 'note'];

  const findKey = (keys: string[], available: string[]) =>
    keys.find((k) => available.some((a) => a.toLowerCase() === k));

  const headers = result.meta.fields ?? [];
  const termKey = findKey(termKeys, headers);
  const transKey = findKey(transKeys, headers);

  if (!termKey || !transKey) {
    throw new Error(`CSV: colonne non trovate. Attese: ${termKeys.join('/')} e ${transKeys.join('/')}`);
  }
  const notesKey = findKey(notesKeys, headers);

  const parsed: GlossaryEntry[] = result.data
    .filter((row) => row[termKey]?.trim() && row[transKey]?.trim())
    .map((row) => ({
      id: generateId('gle'),
      term: row[termKey].trim(),
      translation: row[transKey].trim(),
      notes: notesKey ? (row[notesKey]?.trim() || undefined) : undefined,
    }));

  if (strategy === 'replace') {
    await runInTransaction(async (run) => {
      await run('DELETE FROM glossary_entries WHERE glossary_id = $1', [glossaryId]);
      for (const entry of parsed) {
        await run(
          'INSERT INTO glossary_entries (id, glossary_id, term, translation, notes) VALUES ($1, $2, $3, $4, $5)',
          [entry.id, glossaryId, entry.term, entry.translation, entry.notes ?? ''],
        );
      }
    });
  } else {
    await runInTransaction(async (run) => {
      for (const entry of parsed) {
        await run(
          `INSERT INTO glossary_entries (id, glossary_id, term, translation, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT(glossary_id, term) DO NOTHING`,
          [entry.id, glossaryId, entry.term, entry.translation, entry.notes ?? ''],
        );
      }
    });
  }

  return parsed.length;
}
