import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptPanel } from './PromptPanel';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import type { PromptTemplate } from '../../types';

const minuta: PromptTemplate = {
  id: 't1', name: 'Minuta', prompt: 'Trascrivi la minuta.', context: 'ocr', workflow: 'transcription', createdAt: '',
};
const saveTemplate = vi.fn(async () => undefined);
const updateTemplate = vi.fn(async () => undefined);
const deleteTemplate = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  usePromptTemplateStore.setState({
    templates: [minuta], isLoaded: true, saveTemplate, updateTemplate, deleteTemplate, loadTemplates: vi.fn(async () => undefined),
  });
});

function Harness({ onSave = vi.fn() }: { onSave?: (text: string) => void }) {
  const [value, setValue] = useState('Testo salvato.');
  return (
    <PromptPanel
      label="Prompt"
      value={value}
      defaultValue="Testo predefinito."
      onSave={(text) => { onSave(text); setValue(text); }}
      templateContext="ocr"
      templateWorkflow="transcription"
    />
  );
}

const editor = () => screen.getByRole('textbox', { name: 'Prompt' });

describe('pannello del prompt', () => {
  it('scartare la modifica lascia il prompt di prima', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'pipeline.editPrompt' }));
    fireEvent.change(editor(), { target: { value: 'Altro testo.' } });
    expect(screen.getByText(/promptPanel.unsaved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'promptPanel.discard' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Testo salvato.')).toBeInTheDocument();
  });

  it('salvare usa il testo nuovo e non crea un template', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'pipeline.editPrompt' }));
    fireEvent.change(editor(), { target: { value: 'Testo nuovo.' } });
    fireEvent.keyDown(editor(), { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith('Testo nuovo.');
    expect(saveTemplate).not.toHaveBeenCalled();
    expect(screen.getByText('pipeline.promptSource.custom')).toBeInTheDocument();
  });

  it('la bozza tenuta da chi monta il pannello sopravvive allo smontaggio', async () => {
    function Outer() {
      const [draft, setDraft] = useState<string | null>(null);
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown((value) => !value)}>alterna</button>
          {shown ? (
            <PromptPanel label="Prompt" value="Salvato." defaultValue="Predefinito." onSave={vi.fn()}
              templateContext="ocr" templateWorkflow="transcription" draft={draft} onDraftChange={setDraft} />
          ) : null}
        </>
      );
    }
    render(<Outer />);
    await userEvent.click(screen.getByRole('button', { name: 'pipeline.editPrompt' }));
    fireEvent.change(editor(), { target: { value: 'Bozza in corso.' } });
    await userEvent.click(screen.getByRole('button', { name: 'alterna' }));
    await userEvent.click(screen.getByRole('button', { name: 'alterna' }));
    expect(editor()).toHaveValue('Bozza in corso.');
  });

  it('un template usato e poi modificato si dichiara modificato', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'pipeline.editPrompt' }));
    await userEvent.click(screen.getByRole('button', { name: 'promptPanel.templates' }));
    await userEvent.click(await screen.findByText('Minuta'));
    expect(editor()).toHaveValue('Trascrivi la minuta.');
    fireEvent.change(editor(), { target: { value: 'Trascrivi la minuta, riga per riga.' } });
    expect(screen.getByText(/promptPanel.templateModified/)).toBeInTheDocument();
  });

  it('dal menu si elimina un template con conferma nella riga, senza toccare il prompt', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'pipeline.editPrompt' }));
    await userEvent.click(screen.getByRole('button', { name: 'promptPanel.templates' }));
    const list = await screen.findByRole('list', { name: 'promptPanel.templates' });
    await userEvent.click(within(list).getByRole('button', { name: 'promptPanel.deleteTemplate' }));
    await userEvent.click(within(list).getByRole('button', { name: 'promptPanel.confirmDelete' }));
    expect(deleteTemplate).toHaveBeenCalledWith('t1');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('dal menu si aggiorna un template e si salva il testo come nuovo template', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'pipeline.editPrompt' }));
    await userEvent.click(screen.getByRole('button', { name: 'promptPanel.templates' }));
    const list = await screen.findByRole('list', { name: 'promptPanel.templates' });
    await userEvent.click(within(list).getByRole('button', { name: 'promptPanel.updateTemplate' }));
    expect(updateTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ prompt: 'Testo salvato.' }));

    await userEvent.click(screen.getByRole('button', { name: 'promptPanel.saveAsTemplate' }));
    const name = screen.getByRole('textbox', { name: 'pipeline.templates.namePlaceholder' });
    await userEvent.type(name, 'Nuovo{Enter}');
    expect(saveTemplate).toHaveBeenCalledWith('Nuovo', 'Testo salvato.', 'ocr', 'transcription', undefined, undefined);
  });
});
