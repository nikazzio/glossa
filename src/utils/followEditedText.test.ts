import { describe, expect, it } from 'vitest';
import { followEditedText } from './followEditedText';
import type { TranscriptionNote } from '../services/transcriptionNotesService';

const note = (passage: string, occurrence: number): TranscriptionNote => ({
  id: 'n1', segmentId: 's1', type: 'doubt', content: '', passage, occurrence,
  origin: 'user', sortOrder: 0, createdAt: '',
});

describe('le note seguono il testo modificato a mano', () => {
  it('una frase aggiunta prima con la stessa parola sposta la ripetizione', () => {
    const moves = followEditedText('et dominus meus', 'dominus dixit, et dominus meus', [note('dominus', 1)]);
    expect(moves).toEqual([{ id: 'n1', occurrence: 2 }]);
  });

  it('una modifica che non tocca il passaggio non cambia niente', () => {
    expect(followEditedText('et dominus meus', 'et dominus meus est', [note('dominus', 1)])).toEqual([]);
  });

  it('un passaggio cancellato manda la nota da riagganciare anche se la parola resta altrove', () => {
    const moves = followEditedText('dominus et dominus', 'dominus et', [note('dominus', 2)]);
    expect(moves).toEqual([{ id: 'n1', occurrence: null }]);
  });

  it('una nota già da riagganciare resta com è', () => {
    expect(followEditedText('et meus', 'et meus est', [note('dominus', 1)])).toEqual([]);
  });
});
