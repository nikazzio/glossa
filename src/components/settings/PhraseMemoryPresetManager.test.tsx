import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/phraseMemoryPresetService', () => ({
  listPresets: vi.fn(),
  createCustomPreset: vi.fn(),
  updateCustomPreset: vi.fn(),
  deleteCustomPreset: vi.fn(),
  clonePreset: vi.fn(),
}));

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn((sel) => sel({ activeWorkspace: { id: 'ws-test', name: 'Test', embeddingModel: 'text-embedding-3-small', createdAt: '' } })),
}));

import * as presetService from '../../services/phraseMemoryPresetService';
import type { PhraseMemoryPreset } from '../../types';
import { PhraseMemoryPresetManager } from './PhraseMemoryPresetManager';

const builtInPreset: PhraseMemoryPreset = {
  id: 'preset-default',
  name: 'Predefinito',
  isBuiltin: true,
  config: { splitter: 'regex', similarityThreshold: 0.75, maxResults: 10, minPhraseLength: 3 },
  createdAt: '2026-01-01T00:00:00Z',
};

const customPreset: PhraseMemoryPreset = {
  id: 'preset-custom-1',
  name: 'Mio preset',
  isBuiltin: false,
  config: { splitter: 'llm', similarityThreshold: 0.8, maxResults: 5, minPhraseLength: 4 },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('PhraseMemoryPresetManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(presetService.listPresets).mockResolvedValue([builtInPreset, customPreset]);
  });

  it('mostra i preset caricati dal servizio', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => {
      expect(screen.getByText('Predefinito')).toBeInTheDocument();
      expect(screen.getByText('Mio preset')).toBeInTheDocument();
    });
  });

  it('mostra badge Built-in sul preset built-in', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => expect(screen.getByText('Built-in')).toBeInTheDocument());
  });

  it('mostra bottone Clona sul built-in, non Elimina', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clona/i })).toBeInTheDocument();
    });
    const deleteButtons = screen.queryAllByRole('button', { name: /elimina/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it('clonare un preset built-in chiama clonePreset e ricarica la lista', async () => {
    vi.mocked(presetService.clonePreset).mockResolvedValue('preset-cloned');
    vi.mocked(presetService.listPresets)
      .mockResolvedValueOnce([builtInPreset, customPreset])
      .mockResolvedValueOnce([
        builtInPreset,
        customPreset,
        { ...customPreset, id: 'preset-cloned', name: 'Predefinito (copia)' },
      ]);
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Predefinito'));
    fireEvent.click(screen.getByRole('button', { name: /clona/i }));
    await waitFor(() =>
      expect(presetService.clonePreset).toHaveBeenCalledWith('preset-default', 'ws-test'),
    );
  });

  it('eliminare un preset custom chiama deleteCustomPreset e ricarica', async () => {
    vi.mocked(presetService.deleteCustomPreset).mockResolvedValue(undefined);
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Mio preset'));
    fireEvent.click(screen.getByRole('button', { name: /elimina/i }));
    await waitFor(() =>
      expect(presetService.deleteCustomPreset).toHaveBeenCalledWith('preset-custom-1', 'ws-test'),
    );
  });

  it('mostra il form di creazione quando si clicca su "Nuovo preset"', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Predefinito'));
    fireEvent.click(screen.getByRole('button', { name: /nuovo preset/i }));
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
  });

  it('crea un preset custom e ricarica la lista', async () => {
    vi.mocked(presetService.createCustomPreset).mockResolvedValue({
      id: 'preset-new',
      name: 'Tecnico',
      isBuiltin: false,
      config: { splitter: 'regex', similarityThreshold: 0.75, maxResults: 10, minPhraseLength: 3 },
      createdAt: '2026-01-01T00:00:00Z',
    });
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Predefinito'));
    fireEvent.click(screen.getByRole('button', { name: /nuovo preset/i }));
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Tecnico' } });
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));
    await waitFor(() =>
      expect(presetService.createCustomPreset).toHaveBeenCalledWith(
        'Tecnico',
        expect.objectContaining({ splitter: expect.any(String) }),
        'ws-test',
      ),
    );
  });
});
