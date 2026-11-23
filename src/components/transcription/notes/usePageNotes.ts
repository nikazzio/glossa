import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createNote,
  deleteNote,
  listSegmentNotes,
  moveNoteOccurrences,
  updateNote,
  type NewTranscriptionNote,
  type TranscriptionNote,
  type TranscriptionNoteUpdate,
} from '../../../services/transcriptionNotesService';
import type { TranscriptionRevision, TranscriptionSegment } from '../../../services/transcriptionService';
import { occurrenceAt, resolvePassage, type TextRange } from '../../../utils/noteAnchors';
import type { PassageHighlight } from '../../editor/passageHighlights';
import type { TextSelection } from '../../editor/PageEditor';
import { followEditedText } from './followEditedText';
import { noteTypeLabelKey } from './noteTypes';

export interface PlacedNote {
  note: TranscriptionNote;
  range: TextRange | null;
}

export interface NoteGroups {
  page: PlacedNote[];
  text: PlacedNote[];
  detached: PlacedNote[];
}

/** Il passaggio scelto per una nota nuova o da riagganciare. */
export interface PassageChoice {
  passage: string;
  occurrence: number;
}

const EXCERPT_LENGTH = 80;

function latestRevision(revisions: readonly TranscriptionRevision[]): TranscriptionRevision | null {
  return revisions.reduce<TranscriptionRevision | null>(
    (latest, revision) => (latest === null || revision.revision_number > latest.revision_number ? revision : latest),
    null,
  );
}

/** Il testo selezionato come passaggio, con la sua ripetizione. */
export function passageFromSelection(text: string, selection: TextSelection): PassageChoice | null {
  const passage = text.slice(selection.start, selection.end).trim();
  if (!passage) return null;
  const leading = text.slice(selection.start, selection.end).length - text.slice(selection.start, selection.end).trimStart().length;
  const occurrence = occurrenceAt(text, passage, selection.start + leading);
  return occurrence === null ? null : { passage, occurrence };
}

/**
 * Le note della pagina aperta: caricamento, gruppi (pagina, nel testo, da
 * riagganciare) calcolati sul testo corrente, evidenziazioni per l'editor e
 * comandi. Salvando a mano un testo modificato, le note seguono i passaggi.
 */
export function usePageNotes(segment: TranscriptionSegment | null, draft: string, revisions: readonly TranscriptionRevision[]) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<TranscriptionNote[]>([]);
  const segmentId = segment?.id ?? null;
  const latest = latestRevision(revisions);
  const lastSeenRef = useRef<{ segmentId: string | null; revision: TranscriptionRevision | null }>({ segmentId: null, revision: null });

  const fail = useCallback((err: unknown) => {
    toast.error(t('transcription.notes.saveFailed'), { description: err instanceof Error ? err.message : String(err) });
  }, [t]);

  // Si rileggono quando cambia la pagina o arriva una versione nuova (una
  // lettura automatica le ha appena riscritte).
  useEffect(() => {
    if (!segmentId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    listSegmentNotes(segmentId)
      .then((loaded) => { if (!cancelled) setNotes(loaded); })
      .catch((err: unknown) => { if (!cancelled) fail(err); });
    return () => { cancelled = true; };
  }, [segmentId, latest?.id, fail]);

  // Una versione nuova scritta a mano: le note seguono i loro passaggi.
  useEffect(() => {
    const previous = lastSeenRef.current;
    lastSeenRef.current = { segmentId, revision: latest };
    if (!latest || previous.segmentId !== segmentId || !previous.revision) return;
    if (previous.revision.id === latest.id || latest.created_by !== 'user') return;
    const moves = followEditedText(previous.revision.text, latest.text, notes);
    if (moves.length === 0) return;
    setNotes((current) => current.map((note) => {
      const move = moves.find((candidate) => candidate.id === note.id);
      return move ? { ...note, occurrence: move.occurrence } : note;
    }));
    void moveNoteOccurrences(moves).catch(fail);
    // Solo al cambio di versione: le note lette qui sono quelle del momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId, latest?.id]);

  const groups = useMemo<NoteGroups>(() => {
    const placed = notes.map((note) => ({ note, range: resolvePassage(draft, note.passage, note.occurrence) }));
    return {
      page: placed.filter(({ note }) => note.passage === null),
      text: placed.filter(({ range }) => range !== null).sort((a, b) => (a.range?.start ?? 0) - (b.range?.start ?? 0)),
      detached: placed.filter(({ note, range }) => note.passage !== null && range === null),
    };
  }, [notes, draft]);

  const highlights = useMemo<PassageHighlight[]>(() => groups.text.map(({ note, range }) => {
    const excerpt = note.content.length > EXCERPT_LENGTH ? `${note.content.slice(0, EXCERPT_LENGTH)}…` : note.content;
    return {
      id: note.id,
      start: range?.start ?? 0,
      end: range?.end ?? 0,
      label: excerpt ? `${t(noteTypeLabelKey(note.type))} — ${excerpt}` : t(noteTypeLabelKey(note.type)),
    };
  }), [groups.text, t]);

  const create = async (note: Omit<NewTranscriptionNote, 'segmentId'>): Promise<TranscriptionNote | null> => {
    if (!segmentId) return null;
    try {
      const created = await createNote({ ...note, segmentId });
      setNotes((current) => [...current, created]);
      return created;
    } catch (err: unknown) {
      fail(err);
      return null;
    }
  };

  const update = async (id: string, updates: TranscriptionNoteUpdate) => {
    try {
      await updateNote(id, updates);
      setNotes((current) => current.map((note) => (note.id === id
        ? { ...note, ...updates, origin: 'user', occurrence: updates.passage === null ? null : updates.occurrence ?? note.occurrence }
        : note)));
    } catch (err: unknown) {
      fail(err);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes((current) => current.filter((note) => note.id !== id));
    } catch (err: unknown) {
      fail(err);
    }
  };

  const modelNoteCount = notes.filter((note) => note.origin === 'model').length;

  return { notes, groups, highlights, create, update, remove, modelNoteCount };
}

export type PageNotes = ReturnType<typeof usePageNotes>;
