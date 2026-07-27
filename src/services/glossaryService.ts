import Papa from 'papaparse';
import { select, execute, runInTransaction } from './dbService';
import type { Glossary, GlossaryEntry } from '../types';
import { generateId } from '../utils';

export interface XlsxColumnMap {
  termKey: string;
  translationKey: string;
  notesKey?: string;
}

interface GlossaryRow {
  id: string;
  name: string;
  description: string;
  source_language: string;
  target_language: string;
  created_at: string;
  workspace_id?: string | null;
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
    workspaceId: row.workspace_id ?? undefined,
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

/**
 * Senza `workspaceId`: sfoglia tutti i glossari di tutti i workspace
 * (Libreria generale). Con `workspaceId`: solo quelli posseduti da quel
 * workspace — un glossario appartiene sempre a esattamente un workspace,
 * non esiste piu' un livello "globale senza padrone" (#213).
 */
export async function listGlossaries(workspaceId?: string | null): Promise<Glossary[]> {
  const rows = workspaceId
    ? await select<GlossaryRow>(
        'SELECT id, name, description, source_language, target_language, created_at, workspace_id FROM glossaries WHERE workspace_id = $1 ORDER BY name ASC',
        [workspaceId],
      )
    : await select<GlossaryRow>(
        'SELECT id, name, description, source_language, target_language, created_at, workspace_id FROM glossaries ORDER BY name ASC',
      );
  return rows.map(rowToGlossary);
}

/** Termini totali su tutti i glossari — alimenta la Dashboard. */
export async function countGlossaryEntries(): Promise<number> {
  const rows = await select<{ count: number }>('SELECT COUNT(*) AS count FROM glossary_entries');
  return rows[0]?.count ?? 0;
}

export async function createGlossary(
  name: string,
  description = '',
  sourceLang = '',
  targetLang = '',
  workspaceId: string,
): Promise<string> {
  const id = generateId('gls');
  await execute(
    'INSERT INTO glossaries (id, name, description, source_language, target_language, workspace_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, name, description, sourceLang, targetLang, workspaceId],
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
      `INSERT INTO glossaries (id, name, description, source_language, target_language, workspace_id)
       SELECT $1, $2, description, source_language, target_language, workspace_id FROM glossaries WHERE id = $3`,
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

  return applyGlossaryImportStrategy(glossaryId, parsed, strategy);
}

/** Persiste le voci importate (CSV/XLSX): 'replace' svuota e riscrive, 'merge' aggiunge solo i termini nuovi. */
async function applyGlossaryImportStrategy(
  glossaryId: string,
  parsed: GlossaryEntry[],
  strategy: 'replace' | 'merge',
): Promise<number> {
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
    return parsed.length;
  }

  const [{ count: before }] = await select<{ count: number }>(
    'SELECT COUNT(*) as count FROM glossary_entries WHERE glossary_id = $1',
    [glossaryId],
  );
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
  const [{ count: after }] = await select<{ count: number }>(
    'SELECT COUNT(*) as count FROM glossary_entries WHERE glossary_id = $1',
    [glossaryId],
  );
  return after - before;
}

export function exportGlossaryToCsv(entries: GlossaryEntry[]): string {
  return Papa.unparse(
    entries.map((e) => ({ term: e.term, translation: e.translation, notes: e.notes ?? '' })),
    { header: true },
  );
}

export async function exportGlossaryToXlsx(
  sheetName: string,
  entries: GlossaryEntry[],
): Promise<Uint8Array> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const rows = [
    ['term', 'translation', 'notes'],
    ...entries.map((e) => [e.term, e.translation, e.notes ?? '']),
  ];
  const safeSheet = sheetName.replace(/[/\\?*[\]:]/g, '_').slice(0, 31) || 'Sheet1';
  const result = await writeXlsxFile(rows, { sheet: safeSheet });
  const blob = await result.toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Read xlsx/xls file bytes and return headers + first-sheet rows. */
export async function readXlsxSheet(
  data: Uint8Array,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const { readSheet } = await import('read-excel-file/browser');
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const allRows = await readSheet(arrayBuffer);
  if (allRows.length === 0) return { headers: [], rows: [] };
  const headers = allRows[0].map((cell) => String(cell ?? ''));
  const rows = allRows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = String(row[i] ?? ''); });
    return record;
  });
  return { headers, rows };
}

export async function importEntriesFromXlsx(
  glossaryId: string,
  rows: Record<string, string>[],
  columnMap: XlsxColumnMap,
  strategy: 'replace' | 'merge',
): Promise<number> {
  const parsed: GlossaryEntry[] = rows
    .filter((row) => String(row[columnMap.termKey] ?? '').trim() && String(row[columnMap.translationKey] ?? '').trim())
    .map((row) => ({
      id: generateId('gle'),
      term: String(row[columnMap.termKey]).trim(),
      translation: String(row[columnMap.translationKey]).trim(),
      notes: columnMap.notesKey ? (String(row[columnMap.notesKey]).trim() || undefined) : undefined,
    }));

  return applyGlossaryImportStrategy(glossaryId, parsed, strategy);
}

export async function addGlossaryEntry(
  glossaryId: string,
  entry: Pick<GlossaryEntry, 'id' | 'term' | 'translation' | 'notes'>,
): Promise<void> {
  await execute(
    `INSERT INTO glossary_entries (id, glossary_id, term, translation, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       term = excluded.term,
       translation = excluded.translation,
       notes = excluded.notes`,
    [entry.id, glossaryId, entry.term, entry.translation ?? '', entry.notes ?? ''],
  );
}
