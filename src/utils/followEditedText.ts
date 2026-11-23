import { diffChars } from 'diff';
import { findPassageOccurrences, resolvePassage } from './noteAnchors';

/** Il minimo di una nota che serve per seguirne il passaggio. */
interface AnchoredNote {
  id: string;
  passage: string | null;
  occurrence: number | null;
}

export interface OccurrenceMove {
  id: string;
  /** `null`: il passaggio non c'è più dove stava, la nota va riagganciata. */
  occurrence: number | null;
}

/** Dove finisce, nel testo nuovo, una posizione del testo vecchio; `null` se cancellata. */
function mapPosition(previous: string, next: string, position: number): number | null {
  let oldIndex = 0;
  let newIndex = 0;
  for (const part of diffChars(previous, next)) {
    const length = part.value.length;
    if (part.added) {
      newIndex += length;
      continue;
    }
    if (position < oldIndex + length) {
      return part.removed ? null : newIndex + (position - oldIndex);
    }
    oldIndex += length;
    if (!part.removed) newIndex += length;
  }
  return position === oldIndex ? newIndex : null;
}

/**
 * Il testo è stato modificato a mano: ogni nota agganciata segue il suo
 * passaggio. Se nel testo nuovo il passaggio è ancora dove è finito, la nota
 * ne prende la ripetizione aggiornata; altrimenti va riagganciata. Restituisce
 * solo le note che cambiano.
 */
export function followEditedText(previous: string, next: string, notes: readonly AnchoredNote[]): OccurrenceMove[] {
  return notes.flatMap((note) => {
    const range = resolvePassage(previous, note.passage, note.occurrence);
    if (!note.passage || !range) return [];
    const start = mapPosition(previous, next, range.start);
    const ranges = findPassageOccurrences(next, note.passage);
    const index = start === null ? -1 : ranges.findIndex((candidate) => candidate.start === start);
    const occurrence = index === -1 ? null : index + 1;
    return occurrence === note.occurrence ? [] : [{ id: note.id, occurrence }];
  });
}
