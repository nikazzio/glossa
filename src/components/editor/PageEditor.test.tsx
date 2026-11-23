import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PageEditor } from './PageEditor';
import type { PassageHighlight } from './passageHighlights';

const TEXT = 'Et dixit dominus ad eum';
const highlight: PassageHighlight = { id: 'n1', start: 3, end: 8, label: 'Dubbio — lettura incerta' };

function Harness(props: Partial<Parameters<typeof PageEditor>[0]>) {
  const [value, setValue] = useState(TEXT);
  return <PageEditor value={value} onChange={setValue} identityKey="p1" ariaLabel="pagina" highlights={[highlight]} {...props} />;
}

describe('editor della pagina', () => {
  it('in Scrivi evidenzia il passaggio annotato sotto il testo', () => {
    const { container } = render(<Harness />);
    const mark = container.querySelector('mark[data-note-id="n1"]');
    expect(mark?.textContent).toBe('dixit');
    expect(screen.getByRole('textbox', { name: 'pagina' })).toHaveValue(TEXT);
  });

  it('Leggi mostra il testo formattato con il passaggio evidenziato e il suggerimento', async () => {
    const { container } = render(<Harness value={'Et **dixit** dominus'} highlights={[{ ...highlight, start: 5, end: 10 }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'pageEditor.read' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const mark = container.querySelector('strong mark[data-note-id="n1"]');
    expect(mark?.getAttribute('data-tooltip')).toBe('Dubbio — lettura incerta');
  });

  it('un clic su un passaggio evidenziato apre la sua nota, in Scrivi e in Leggi', async () => {
    const onHighlightClick = vi.fn();
    const { container } = render(<Harness onHighlightClick={onHighlightClick} />);
    const textarea = screen.getByRole('textbox', { name: 'pagina' }) as HTMLTextAreaElement;
    textarea.setSelectionRange(5, 5);
    fireEvent.click(textarea);
    expect(onHighlightClick).toHaveBeenLastCalledWith('n1');

    await userEvent.click(screen.getByRole('button', { name: 'pageEditor.read' }));
    fireEvent.click(container.querySelector('mark[data-note-id="n1"]') as Element);
    expect(onHighlightClick).toHaveBeenCalledTimes(2);
  });

  it('crea una nota sul testo selezionato con il comando nel margine e con la scorciatoia', () => {
    const onCreateNote = vi.fn();
    render(<Harness onCreateNote={onCreateNote} />);
    const button = screen.getByRole('button', { name: 'pageEditor.addNoteNeedsSelection' });
    expect(button).toBeDisabled();

    const textarea = screen.getByRole('textbox', { name: 'pagina' }) as HTMLTextAreaElement;
    textarea.setSelectionRange(9, 16);
    fireEvent.select(textarea);
    fireEvent.click(screen.getByRole('button', { name: 'pageEditor.addNote' }));
    expect(onCreateNote).toHaveBeenLastCalledWith({ start: 9, end: 16 });

    fireEvent.keyDown(textarea, { code: 'KeyN', key: 'n', ctrlKey: true, altKey: true });
    expect(onCreateNote).toHaveBeenCalledTimes(2);
  });

  it('applica la formattazione dal menu del margine', async () => {
    render(<Harness />);
    const textarea = screen.getByRole('textbox', { name: 'pagina' }) as HTMLTextAreaElement;
    textarea.setSelectionRange(3, 8);
    await userEvent.click(screen.getByRole('button', { name: 'pageEditor.format' }));
    fireEvent.click(await screen.findByRole('button', { name: 'editor.bold' }));
    expect(textarea).toHaveValue('Et **dixit** dominus ad eum');
  });

  it('in sola lettura il testo non si modifica e la formattazione è spenta', async () => {
    render(<Harness readOnly />);
    expect(screen.getByRole('textbox', { name: 'pagina' })).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: 'pageEditor.format' }));
    expect(await screen.findByRole('button', { name: 'editor.bold' })).toBeDisabled();
  });

  it('la versione compatta non ha margine di comandi', () => {
    render(<Harness compact />);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'pagina' })).toBeInTheDocument();
  });
});
