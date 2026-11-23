/**
 * Dove sta nel testo il passaggio di una nota.
 *
 * Il confronto tollera maiuscole, spazi e punteggiatura: si confrontano solo
 * lettere e cifre (minuscole), con un solo spazio fra le parole. La stessa
 * regola esiste nel motore (`src-tauri/src/ocr/notes.rs`), che aggancia le
 * note della lettura automatica: le due copie si provano sugli stessi casi
 * (`src-tauri/src/ocr/note_anchor_cases.json`) e devono restare identiche.
 */

export interface TextRange {
  start: number;
  end: number;
}

interface Normalized {
  text: string;
  /** Per ogni carattere ridotto, dove inizia e finisce nel testo originale. */
  starts: number[];
  ends: number[];
}

const KEEP = /[\p{Alphabetic}\p{N}]/u;
const SPACE = /\p{White_Space}/u;

function normalize(source: string): Normalized {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace = false;
  let index = 0;
  for (const char of source) {
    const end = index + char.length;
    if (SPACE.test(char)) {
      pendingSpace = chars.length > 0;
    } else if (KEEP.test(char)) {
      if (pendingSpace) {
        chars.push(' ');
        starts.push(index);
        ends.push(index);
        pendingSpace = false;
      }
      for (const lower of char.toLowerCase()) {
        chars.push(lower);
        starts.push(index);
        ends.push(end);
      }
    }
    index = end;
  }
  return { text: chars.join(''), starts, ends };
}

/** Tutte le ripetizioni del passaggio, in ordine di lettura. */
export function findPassageOccurrences(text: string, passage: string): TextRange[] {
  const needle = normalize(passage).text;
  if (!needle) return [];
  const haystack = normalize(text);
  const ranges: TextRange[] = [];
  let from = haystack.text.indexOf(needle);
  while (from !== -1) {
    ranges.push({ start: haystack.starts[from], end: haystack.ends[from + needle.length - 1] });
    from = haystack.text.indexOf(needle, from + 1);
  }
  return ranges;
}

/** La `occurrence`-esima ripetizione (da 1), o `null` se non c'è. */
export function resolvePassage(text: string, passage: string | null, occurrence: number | null): TextRange | null {
  if (!passage || !occurrence || occurrence < 1) return null;
  return findPassageOccurrences(text, passage)[occurrence - 1] ?? null;
}

/**
 * Quale ripetizione del passaggio è quella selezionata: la più vicina
 * all'inizio della selezione. `null` se il passaggio non si trova.
 */
export function occurrenceAt(text: string, passage: string, selectionStart: number): number | null {
  const ranges = findPassageOccurrences(text, passage);
  if (ranges.length === 0) return null;
  let best = 0;
  ranges.forEach((range, index) => {
    if (Math.abs(range.start - selectionStart) < Math.abs(ranges[best].start - selectionStart)) best = index;
  });
  return best + 1;
}
