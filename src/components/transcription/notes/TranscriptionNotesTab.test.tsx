import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptionNotesTab } from './TranscriptionNotesTab';
import type { NoteGroups, PassageChoice } from './usePageNotes';
import type { TranscriptionNote, TranscriptionNoteType } from '../../../services/transcriptionNotesService';

let sequence = 0;
const note = (type: TranscriptionNoteType, content: string, passage: string | null = null): TranscriptionNote => ({
  id: `n${++sequence}`, segmentId: 's1', type, content, passage, occurrence: passage ? 1 : null,
  origin: 'model', sortOrder: sequence, createdAt: '',
});

function groups(): NoteGroups {
  return {
    page: [{ note: note('note', 'inchiostro sbiadito'), range: null }],
    text: [
      { note: note('doubt', 'lettura incerta', 'et dixit'), range: { start: 0, end: 8 } },
      { note: note('doubt', 'forse dixerit', 'dominus'), range: { start: 9, end: 16 } },
      { note: note('addition', 'in margine', 'meus'), range: { start: 17, end: 21 } },
    ],
    detached: [{ note: { ...note('emendation', 'integrato', 'sanctis'), occurrence: null }, range: null }],
  };
}

function renderTab(overrides: Partial<Parameters<typeof TranscriptionNotesTab>[0]> = {}) {
  const props = {
    groups: groups(),
    selectedNoteId: null,
    selectionRequest: 0,
    selectionPassage: null as PassageChoice | null,
    newNote: null,
    onNewNote: vi.fn(),
    onCreate: vi.fn(async () => true),
    onUpdate: vi.fn(async () => true),
    onDelete: vi.fn(),
    onLocate: vi.fn(),
    ...overrides,
  };
  render(<TranscriptionNotesTab {...props} />);
  return props;
}

describe('scheda Note della trascrizione', () => {
  it('mostra le note nei gruppi Pagina, Nel testo e Da riagganciare', () => {
    renderTab();
    expect(screen.getByText('transcription.notes.groupPage')).toBeInTheDocument();
    expect(screen.getByText('transcription.notes.groupText')).toBeInTheDocument();
    expect(screen.getByText('transcription.notes.groupDetached')).toBeInTheDocument();
    expect(screen.getByText('inchiostro sbiadito')).toBeInTheDocument();
    expect(screen.getByText(/«sanctis»/)).toBeInTheDocument();
  });

  it('il filtro Dubbio mostra solo i dubbi', async () => {
    renderTab();
    // Ordine dei pallini: Tutte, poi i tipi — Intervento, Dubbio, …
    await userEvent.click(screen.getAllByRole('radio')[2]);
    expect(screen.getByText('lettura incerta')).toBeInTheDocument();
    expect(screen.getByText('forse dixerit')).toBeInTheDocument();
    expect(screen.queryByText('in margine')).toBeNull();
    expect(screen.queryByText('inchiostro sbiadito')).toBeNull();
  });

  it('una nota aperta dal testo si vede anche con il filtro di un altro tipo', async () => {
    const base = { groups: groups(), selectionRequest: 0 };
    const { rerender } = render(<TranscriptionNotesTab {...base} selectedNoteId={null} selectionPassage={null} newNote={null}
      onNewNote={vi.fn()} onCreate={vi.fn(async () => true)} onUpdate={vi.fn(async () => true)} onDelete={vi.fn()} onLocate={vi.fn()} />);
    await userEvent.click(screen.getAllByRole('radio')[2]);
    expect(screen.queryByText('in margine')).toBeNull();
    const addition = base.groups.text[2].note.id;
    rerender(<TranscriptionNotesTab {...base} selectedNoteId={addition} selectionRequest={1} selectionPassage={null} newNote={null}
      onNewNote={vi.fn()} onCreate={vi.fn(async () => true)} onUpdate={vi.fn(async () => true)} onDelete={vi.fn()} onLocate={vi.fn()} />);
    expect(screen.getByText('in margine')).toBeInTheDocument();
  });

  it('se il salvataggio di una nota nuova fallisce il modulo resta aperto con il testo', async () => {
    const props = renderTab({ newNote: { passage: null, requestId: 1 }, onCreate: vi.fn(async () => false) });
    fireEvent.change(screen.getByRole('textbox', { name: 'transcription.notes.text' }), { target: { value: 'da non perdere' } });
    await userEvent.click(screen.getByRole('button', { name: 'transcription.notes.save' }));
    expect(props.onNewNote).not.toHaveBeenCalledWith(null);
    expect(screen.getByRole('textbox', { name: 'transcription.notes.text' })).toHaveValue('da non perdere');
  });

  it('una pagina senza note mostra lo stato vuoto e il comando per aggiungerne una', async () => {
    const props = renderTab({ groups: { page: [], text: [], detached: [] } });
    expect(screen.getByText('transcription.notes.empty')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'transcription.notes.addPageNote' }));
    expect(props.onNewNote).toHaveBeenCalledWith(expect.objectContaining({ passage: null }));
  });

  it('trova nel testo, modifica ed elimina una nota', async () => {
    const props = renderTab();
    const card = screen.getByText('in margine').closest('li') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'transcription.notes.locate' }));
    expect(props.onLocate).toHaveBeenCalled();

    await userEvent.click(within(card).getByRole('button', { name: 'transcription.notes.edit' }));
    const editor = screen.getByRole('textbox', { name: 'transcription.notes.text' });
    fireEvent.change(editor, { target: { value: 'aggiunta a margine, mano B' } });
    await userEvent.click(screen.getByRole('button', { name: 'transcription.notes.save' }));
    expect(props.onUpdate).toHaveBeenCalledWith(expect.any(String), { type: 'addition', content: 'aggiunta a margine, mano B' });

    const doubt = screen.getByText('lettura incerta').closest('li') as HTMLElement;
    await userEvent.click(within(doubt).getByRole('button', { name: 'transcription.notes.delete' }));
    await userEvent.click(within(doubt).getByRole('button', { name: 'transcription.notes.confirmDeleteYes' }));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('riaggancia una nota al passaggio selezionato nel testo', async () => {
    const props = renderTab({ selectionPassage: { passage: 'sanctis', occurrence: 2 } });
    const card = screen.getByText(/«sanctis»/).closest('li') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'transcription.notes.reattach' }));
    expect(props.onUpdate).toHaveBeenCalledWith(expect.any(String), { passage: 'sanctis', occurrence: 2 });
  });

  it('senza testo selezionato il riaggancio è spento e dice perché', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'transcription.notes.reattachNeedsSelection' })).toBeDisabled();
  });

  it('una nota nuova sul passaggio selezionato si salva con tipo e testo', async () => {
    const passage = { passage: 'dominus', occurrence: 2 };
    const props = renderTab({ newNote: { passage, requestId: 1 } });
    const form = screen.getByText('transcription.notes.newNote').closest('section') as HTMLElement;
    expect(within(form).getByText('«dominus»')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'transcription.notes.type' }), { target: { value: 'abbreviation' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'transcription.notes.text' }), { target: { value: 'sciolto da dns' } });
    await userEvent.click(screen.getByRole('button', { name: 'transcription.notes.save' }));
    expect(props.onCreate).toHaveBeenCalledWith({ type: 'abbreviation', content: 'sciolto da dns' }, passage);
    expect(props.onNewNote).toHaveBeenCalledWith(null);
  });
});
