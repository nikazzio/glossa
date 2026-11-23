import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPassageOccurrences, occurrenceAt, resolvePassage } from './noteAnchors';

interface AnchorCase {
  name: string;
  text: string;
  passage: string;
  occurrence: number;
  count: number;
  expected: string | null;
}

// Gli stessi casi li legge il motore: le due copie della regola restano uguali.
const cases = JSON.parse(
  readFileSync(resolve(__dirname, '../../src-tauri/src/ocr/note_anchor_cases.json'), 'utf8'),
) as AnchorCase[];

describe('aggancio del passaggio di una nota', () => {
  it.each(cases)('$name', ({ text, passage, occurrence, count, expected }) => {
    expect(findPassageOccurrences(text, passage)).toHaveLength(count);
    const range = resolvePassage(text, passage, occurrence);
    expect(range ? text.slice(range.start, range.end) : null).toBe(expected);
  });

  it('una nota senza passaggio non si aggancia', () => {
    expect(resolvePassage('dominus', null, null)).toBeNull();
  });

  it('riconosce la ripetizione selezionata', () => {
    const text = 'dominus et dominus meus';
    expect(occurrenceAt(text, 'dominus', text.lastIndexOf('dominus'))).toBe(2);
    expect(occurrenceAt(text, 'dominus', 0)).toBe(1);
    expect(occurrenceAt(text, 'sanctis', 0)).toBeNull();
  });
});
