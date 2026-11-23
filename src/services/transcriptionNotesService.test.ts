import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execute, select } from './dbService';
import {
  followNotesToText,
  countModelNotes,
  createNote,
  deleteNote,
  listSegmentNotes,
  moveNoteOccurrences,
  updateNote,
} from './transcriptionNotesService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn() }));

const selectMock = vi.mocked(select);
const executeMock = vi.mocked(execute);

beforeEach(() => {
  selectMock.mockReset();
  executeMock.mockReset();
});

describe('note della pagina di trascrizione', () => {
  it('legge le note con tipo, passaggio e occorrenza, e ripiega su Nota per un tipo sconosciuto', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'n1', segment_id: 's1', type: 'doubt', content: 'incerto', passage: 'et dixit', occurrence: 2, origin: 'model', sort_order: 0, created_at: 'x' },
      { id: 'n2', segment_id: 's1', type: 'glossa', content: 'mano tarda', passage: '', occurrence: 3, origin: 'user', sort_order: 1, created_at: 'y' },
    ]);

    const notes = await listSegmentNotes('s1');

    expect(notes[0]).toMatchObject({ type: 'doubt', passage: 'et dixit', occurrence: 2, origin: 'model' });
    expect(notes[1]).toMatchObject({ type: 'note', passage: null, occurrence: null, origin: 'user' });
  });

  it('crea una nota scritta a mano in fondo all elenco della pagina', async () => {
    selectMock.mockResolvedValueOnce([{ next: 4 }]);

    const note = await createNote({ segmentId: 's1', type: 'addition', content: 'in margine', passage: 'dominus', occurrence: 2 });

    expect(note).toMatchObject({ origin: 'user', sortOrder: 4, passage: 'dominus', occurrence: 2 });
    const [query, params] = executeMock.mock.calls[0];
    expect(query).toContain('INSERT INTO transcription_notes');
    expect(params).toEqual(expect.arrayContaining(['s1', 'addition', 'in margine', 'dominus', 2, 4]));
  });

  it('una nota della pagina intera non ha occorrenza', async () => {
    selectMock.mockResolvedValueOnce([{ next: null }]);

    const note = await createNote({ segmentId: 's1', type: 'note', content: 'inchiostro sbiadito', passage: '  ', occurrence: 1 });

    expect(note).toMatchObject({ passage: null, occurrence: null, sortOrder: 0 });
  });

  it('correggere una nota del modello la rende dell utente', async () => {
    await updateNote('n1', { content: 'lettura incerta, forse dixerit' });

    const [query, params] = executeMock.mock.calls[0];
    expect(query).toContain(`origin = 'user'`);
    expect(params).toEqual(['lettura incerta, forse dixerit', 'n1']);
  });

  it('riagganciare una nota ne salva passaggio e occorrenza', async () => {
    await updateNote('n1', { passage: 'sanctis', occurrence: 1 });

    const [query, params] = executeMock.mock.calls[0];
    expect(query).toContain('passage = $1');
    expect(query).toContain('occurrence = $2');
    expect(params).toEqual(['sanctis', 1, 'n1']);
  });

  it('spostare la ripetizione dopo una modifica del testo non rende la nota dell utente', async () => {
    await moveNoteOccurrences([{ id: 'n1', occurrence: 3 }]);

    const [query, params] = executeMock.mock.calls[0];
    expect(query).not.toContain('origin');
    expect(params).toEqual([3, 'n1']);
  });

  it('conta solo le note del modello, quelle che la rilettura sostituisce', async () => {
    selectMock.mockResolvedValueOnce([{ count: 5 }]);

    await expect(countModelNotes('s1')).resolves.toBe(5);
    expect(String(selectMock.mock.calls[0][0])).toContain(`origin = 'model'`);
  });

  it('elimina una nota', async () => {
    await deleteNote('n1');

    expect(executeMock).toHaveBeenCalledWith('DELETE FROM transcription_notes WHERE id = $1', ['n1']);
  });

  it('salvato il testo a mano, le note seguono il loro passaggio', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'n1', segment_id: 's1', type: 'doubt', content: '', passage: 'dominus', occurrence: 1, origin: 'user', sort_order: 0, created_at: '' },
    ]);

    await followNotesToText('s1', 'et dominus meus', 'dominus dixit, et dominus meus');

    expect(executeMock).toHaveBeenCalledWith('UPDATE transcription_notes SET occurrence = $1 WHERE id = $2', [2, 'n1']);
  });

  it('un testo identico non tocca le note', async () => {
    await followNotesToText('s1', 'et dominus', 'et dominus');
    expect(selectMock).not.toHaveBeenCalled();
  });
});
