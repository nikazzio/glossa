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
 * Senza `workspaceId`: tutti i dizionari, che è il catalogo generale. Con
 * `workspaceId`: quelli **collegati** a quel workspace (#213).
 *
 * Il legame non sta più sulla riga del dizionario: un dizionario si può usare
 * in più workspace senza copiarlo, e dove è nato lo dice la sua provenienza.
 */
export async function listGlossaries(workspaceId?: string | null): Promise<Glossary[]> {
  const rows = workspaceId
    ? await select<GlossaryRow>(
        `SELECT g.id, g.name, g.description, g.source_language, g.target_language, g.created_at,
                wi.workspace_id
           FROM glossaries g
           JOIN workspace_items wi
             ON wi.item_type = 'glossary' AND wi.item_id = g.id AND wi.workspace_id = $1
          ORDER BY g.name ASC`,
        [workspaceId],
      )
    : await select<GlossaryRow>(
        `SELECT g.id, g.name, g.description, g.source_language, g.target_language, g.created_at,
                (SELECT wi.workspace_id FROM workspace_items wi
                  WHERE wi.item_type = 'glossary' AND wi.item_id = g.id AND wi.is_origin = 1
                  LIMIT 1) AS workspace_id
           FROM glossaries g
          ORDER BY g.name ASC`,
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
  await runInTransaction(async (run) => {
    await run(
      'INSERT INTO glossaries (id, name, description, source_language, target_language) VALUES ($1, $2, $3, $4, $5)',
      [id, name, description, sourceLang, targetLang],
    );
    // Nasce qui: il collegamento porta anche la provenienza.
    await run(
      `INSERT INTO workspace_items (workspace_id, item_type, item_id, is_origin)
       VALUES ($1, 'glossary', $2, 1)`,
      [workspaceId, id],
    );
  });
  return id;
}

export async function renameGlossary(id: string, name: string): Promise<void> {
  await execute('UPDATE glossaries SET name = $1 WHERE id = $2', [name, id]);
}

export async function deleteGlossary(id: string): Promise<void> {
  await execute('DELETE FROM glossaries WHERE id = $1', [id]);
}

/**
 * Le voci di un dizionario **come le vede un workspace** (#213).
 *
 * Un dizionario collegato a più workspace resta uno solo, ma ognuno può
 * correggere una voce a casa propria senza toccare l'originale, e nasconderne
 * una che lì non va bene. Senza `workspaceId` si leggono le voci originali,
 * che è ciò che serve al catalogo generale e all'esportazione.
 */
export async function getGlossaryEntries(
  glossaryId: string,
  workspaceId?: string | null,
): Promise<GlossaryEntry[]> {
  if (!workspaceId) {
    const rows = await select<GlossaryEntryRow>(
      'SELECT id, glossary_id, term, translation, notes FROM glossary_entries WHERE glossary_id = $1 ORDER BY term ASC',
      [glossaryId],
    );
    return rows.map(rowToEntry);
  }

  const rows = await select<GlossaryEntryRow & { overridden: number }>(
    `SELECT e.id, e.glossary_id, e.term,
            COALESCE(o.translation, e.translation) AS translation,
            COALESCE(o.notes, e.notes)             AS notes,
            CASE WHEN o.entry_id IS NULL THEN 0 ELSE 1 END AS overridden
       FROM glossary_entries e
       LEFT JOIN glossary_entry_overrides o
         ON o.entry_id = e.id AND o.workspace_id = $2
      WHERE e.glossary_id = $1 AND COALESCE(o.hidden, 0) = 0
      ORDER BY e.term ASC`,
    [glossaryId, workspaceId],
  );
  return rows.map((row) => ({ ...rowToEntry(row), overridden: row.overridden === 1 }));
}

/**
 * Corregge una voce **solo per questo workspace**. Passare `null` a un campo
 * lo riporta al valore del dizionario.
 */
export async function overrideGlossaryEntry(
  workspaceId: string,
  entryId: string,
  changes: { translation?: string | null; notes?: string | null; hidden?: boolean },
): Promise<void> {
  await execute(
    `INSERT INTO glossary_entry_overrides (workspace_id, entry_id, translation, notes, hidden)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(workspace_id, entry_id) DO UPDATE SET
       translation = excluded.translation,
       notes       = excluded.notes,
       hidden      = excluded.hidden,
       updated_at  = CURRENT_TIMESTAMP`,
    [
      workspaceId,
      entryId,
      changes.translation ?? null,
      changes.notes ?? null,
      changes.hidden ? 1 : 0,
    ],
  );
}

/** Toglie la correzione: la voce torna quella del dizionario. */
export async function clearGlossaryEntryOverride(
  workspaceId: string,
  entryId: string,
): Promise<void> {
  await execute(
    'DELETE FROM glossary_entry_overrides WHERE workspace_id = $1 AND entry_id = $2',
    [workspaceId, entryId],
  );
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

/**
 * Crea una copia indipendente nel workspace scelto: voci duplicate, nessun
 * legame con l'originale.
 *
 * Resta accanto al collegamento perché sono due intenzioni diverse: si collega
 * un dizionario per **usarlo com'è** — con la possibilità di correggerne una
 * voce solo qui — e si copia quando si vuole prenderne le mosse e andare per
 * la propria strada.
 */
export async function forkGlossary(
  id: string,
  newName: string,
  destinationWorkspaceId: string,
): Promise<string> {
  const [source] = await select<GlossaryRow>(
    'SELECT id, name, description, source_language, target_language, created_at FROM glossaries WHERE id = $1',
    [id],
  );
  if (!source) throw new Error('glossary_not_found');
  const entries = await select<GlossaryEntryRow>(
    'SELECT id, glossary_id, term, translation, notes FROM glossary_entries WHERE glossary_id = $1',
    [id],
  );

  const newId = generateId('gls');
  await runInTransaction(async (run) => {
    await run(
      `INSERT INTO glossaries (id, name, description, source_language, target_language)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId, newName, source.description, source.source_language, source.target_language],
    );
    await run(
      `INSERT INTO workspace_items (workspace_id, item_type, item_id, is_origin)
       VALUES ($1, 'glossary', $2, 1)`,
      [destinationWorkspaceId, newId],
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

/** Il dizionario è **nato** in questo workspace, o lo sta soltanto usando? */
export async function isGlossaryHome(
  glossaryId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await select<{ is_origin: number }>(
    `SELECT is_origin FROM workspace_items
      WHERE item_type = 'glossary' AND item_id = $1 AND workspace_id = $2`,
    [glossaryId, workspaceId],
  );
  return rows[0]?.is_origin === 1;
}

/**
 * Salva le modifiche di un workspace **ospite**: non tocca il dizionario, ne
 * corregge la copia che vede lui (#213).
 *
 * Il confronto è con le voci originali: quella cambiata diventa una
 * correzione, quella tolta dall'elenco diventa nascosta, quella riportata al
 * valore di partenza perde la correzione. Una voce **nuova** entra invece nel
 * dizionario per tutti: non si può correggere una voce che non esiste, e chi
 * la aggiunge sta aggiungendo un termine, non correggendone uno.
 */
export async function saveGlossaryEntriesAsOverrides(
  glossaryId: string,
  workspaceId: string,
  entries: GlossaryEntry[],
): Promise<void> {
  const canonical = await getGlossaryEntries(glossaryId);
  const byId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]));

  await runInTransaction(async (run) => {
    for (const original of canonical) {
      const edited = original.id ? byId.get(original.id) : undefined;
      if (!edited) {
        await run(
          `INSERT INTO glossary_entry_overrides (workspace_id, entry_id, hidden)
           VALUES ($1, $2, 1)
           ON CONFLICT(workspace_id, entry_id) DO UPDATE SET hidden = 1, updated_at = CURRENT_TIMESTAMP`,
          [workspaceId, original.id],
        );
        continue;
      }
      const sameTranslation = edited.translation === original.translation;
      const sameNotes = (edited.notes ?? '') === (original.notes ?? '');
      if (sameTranslation && sameNotes) {
        await run(
          'DELETE FROM glossary_entry_overrides WHERE workspace_id = $1 AND entry_id = $2',
          [workspaceId, original.id],
        );
        continue;
      }
      await run(
        `INSERT INTO glossary_entry_overrides (workspace_id, entry_id, translation, notes, hidden)
         VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT(workspace_id, entry_id) DO UPDATE SET
           translation = excluded.translation,
           notes       = excluded.notes,
           hidden      = 0,
           updated_at  = CURRENT_TIMESTAMP`,
        [workspaceId, original.id, edited.translation, edited.notes ?? null],
      );
    }

    // Termini nuovi: entrano nel dizionario, perché non c'è niente da correggere.
    const known = new Set(canonical.map((entry) => entry.id));
    for (const entry of entries) {
      if (entry.id && known.has(entry.id)) continue;
      if (!entry.term.trim() || !entry.translation.trim()) continue;
      await run(
        'INSERT INTO glossary_entries (id, glossary_id, term, translation, notes) VALUES ($1, $2, $3, $4, $5)',
        [entry.id ?? generateId('gle'), glossaryId, entry.term, entry.translation, entry.notes ?? ''],
      );
    }
  });
}
