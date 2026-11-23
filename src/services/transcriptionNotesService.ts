import { execute, select } from './dbService';
import { followEditedText } from '../utils/followEditedText';

/**
 * Le note della pagina di trascrizione: separate dal testo, legate alla
 * pagina e non a una sua versione.
 *
 * Una nota ricorda il passaggio e **quale ripetizione** del passaggio è
 * (`occurrence`, da 1). Se il passaggio manca la nota è della pagina intera.
 * Lo stato «agganciata / da riagganciare» non si salva: si ricava dal testo
 * corrente (vedi `utils/noteAnchors.ts`).
 *
 * Le note `model` nascono dalla lettura automatica e la rilettura le
 * sostituisce; quelle `user` sono scritte o corrette a mano e restano.
 */

export const TRANSCRIPTION_NOTE_TYPES = [
  'emendation',
  'doubt',
  'addition',
  'correction',
  'typography',
  'abbreviation',
  'note',
] as const;

export type TranscriptionNoteType = (typeof TRANSCRIPTION_NOTE_TYPES)[number];
export type TranscriptionNoteOrigin = 'model' | 'user';

export interface TranscriptionNote {
  id: string;
  segmentId: string;
  type: TranscriptionNoteType;
  content: string;
  passage: string | null;
  occurrence: number | null;
  origin: TranscriptionNoteOrigin;
  sortOrder: number;
  createdAt: string;
}

interface NoteRow {
  id: string;
  segment_id: string;
  type: string;
  content: string | null;
  passage: string | null;
  occurrence: number | null;
  origin: string;
  sort_order: number | null;
  created_at: string | null;
}

export function isTranscriptionNoteType(value: unknown): value is TranscriptionNoteType {
  return typeof value === 'string' && (TRANSCRIPTION_NOTE_TYPES as readonly string[]).includes(value);
}

function toNote(row: NoteRow): TranscriptionNote {
  const passage = row.passage?.trim() ? row.passage : null;
  return {
    id: row.id,
    segmentId: row.segment_id,
    type: isTranscriptionNoteType(row.type) ? row.type : 'note',
    content: row.content ?? '',
    passage,
    occurrence: passage && Number.isInteger(row.occurrence) && (row.occurrence ?? 0) >= 1 ? row.occurrence : null,
    origin: row.origin === 'model' ? 'model' : 'user',
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at ?? '',
  };
}

export async function listSegmentNotes(segmentId: string): Promise<TranscriptionNote[]> {
  const rows = await select<NoteRow>(
    `SELECT id, segment_id, type, content, passage, occurrence, origin, sort_order, created_at
       FROM transcription_notes
      WHERE segment_id = $1
      ORDER BY sort_order ASC, created_at ASC`,
    [segmentId],
  );
  return rows.map(toNote);
}

/** Quante note della lettura automatica la prossima rilettura sostituirebbe. */
export async function countModelNotes(segmentId: string): Promise<number> {
  const rows = await select<{ count: number }>(
    `SELECT COUNT(*) AS count FROM transcription_notes WHERE segment_id = $1 AND origin = 'model'`,
    [segmentId],
  );
  return rows[0]?.count ?? 0;
}

export interface NewTranscriptionNote {
  segmentId: string;
  type: TranscriptionNoteType;
  content: string;
  passage: string | null;
  occurrence: number | null;
}

/** Una nota scritta a mano: in fondo all'elenco della pagina. */
export async function createNote(note: NewTranscriptionNote): Promise<TranscriptionNote> {
  const id = `tn_${crypto.randomUUID().replace(/-/g, '')}`;
  const passage = note.passage?.trim() ? note.passage : null;
  const occurrence = passage ? note.occurrence : null;
  const rows = await select<{ next: number | null }>(
    `SELECT MAX(sort_order) + 1 AS next FROM transcription_notes WHERE segment_id = $1`,
    [note.segmentId],
  );
  const sortOrder = rows[0]?.next ?? 0;
  const createdAt = new Date().toISOString();
  await execute(
    `INSERT INTO transcription_notes
       (id, segment_id, type, content, passage, occurrence, origin, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'user', $7, $8, $8)`,
    [id, note.segmentId, note.type, note.content, passage, occurrence, sortOrder, createdAt],
  );
  return {
    id,
    segmentId: note.segmentId,
    type: note.type,
    content: note.content,
    passage,
    occurrence,
    origin: 'user',
    sortOrder,
    createdAt,
  };
}

export type TranscriptionNoteUpdate = Partial<Pick<TranscriptionNote, 'type' | 'content' | 'passage' | 'occurrence'>>;

/**
 * Una correzione a mano: la nota diventa dell'utente, così la rilettura non
 * la sostituisce.
 */
export async function updateNote(id: string, updates: TranscriptionNoteUpdate): Promise<void> {
  const sets: string[] = [`origin = 'user'`, `updated_at = CURRENT_TIMESTAMP`];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (updates.type !== undefined) push('type', updates.type);
  if (updates.content !== undefined) push('content', updates.content);
  if (updates.passage !== undefined) {
    const passage = updates.passage?.trim() ? updates.passage : null;
    push('passage', passage);
    push('occurrence', passage ? updates.occurrence ?? null : null);
  } else if (updates.occurrence !== undefined) {
    push('occurrence', updates.occurrence);
  }
  params.push(id);
  await execute(`UPDATE transcription_notes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

/**
 * Il testo è cambiato e il passaggio si è spostato fra le sue ripetizioni
 * (`null`: non c'è più, la nota va riagganciata): si aggiorna solo il numero
 * della ripetizione, senza rendere la nota dell'utente — non è una correzione
 * della nota.
 */
export async function moveNoteOccurrences(moves: ReadonlyArray<{ id: string; occurrence: number | null }>): Promise<void> {
  for (const move of moves) {
    await execute(`UPDATE transcription_notes SET occurrence = $1 WHERE id = $2`, [move.occurrence, move.id]);
  }
}

export async function deleteNote(id: string): Promise<void> {
  await execute(`DELETE FROM transcription_notes WHERE id = $1`, [id]);
}

/**
 * Il testo della pagina è stato riscritto a mano (salvataggio o ripristino):
 * ogni nota agganciata segue il suo passaggio dal testo vecchio al nuovo.
 * Si fa qui, con la nuova versione, e non nella scheda aperta: vale anche
 * cambiando pagina o chiudendo lo Studio subito dopo.
 */
export async function followNotesToText(segmentId: string, previous: string, next: string): Promise<void> {
  if (previous === next) return;
  const notes = await listSegmentNotes(segmentId);
  const moves = followEditedText(previous, next, notes);
  if (moves.length > 0) await moveNoteOccurrences(moves);
}
