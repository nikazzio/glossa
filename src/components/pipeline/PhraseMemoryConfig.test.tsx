import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/phraseMemoryPresetService', () => ({
  listPresets: vi.fn(),
}));

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn((sel) => sel({ activeWorkspace: { id: 'ws-test', name: 'Test', embeddingModel: 'text-embedding-3-small', createdAt: '' } })),
}));

import * as presetService from '../../services/phraseMemoryPresetService';
import type { PhraseMemoryOverrides, PhraseMemoryPreset } from '../../types';
import { PhraseMemoryConfig } from './PhraseMemoryConfig';

const preset: PhraseMemoryPreset = {
  id: 'preset-default',
  name: 'Predefinito',
  isBuiltin: true,
  config: { splitter: 'regex', similarityThreshold: 0.75, maxResults: 10, minPhraseLength: 3 },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('PhraseMemoryConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(presetService.listPresets).mockResolvedValue([preset]);
  });

  it('mostra toggle disattivo per default', () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={false}
        presetId={null}
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('attivare il toggle chiama onChange con usePhraseMemory=true', () => {
    const onChange = vi.fn();
    render(
      <PhraseMemoryConfig
        usePhraseMemory={false}
        presetId={null}
        overrides={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ usePhraseMemory: true }),
    );
  });

  it('mostra dropdown preset quando il toggle è attivo', async () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  it('non mostra dropdown quando toggle è disattivo', () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={false}
        presetId={null}
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('mostra sezione Avanzate collassata', async () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /avanzate/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/soglia similarità/i)).not.toBeInTheDocument();
  });

  it('espande la sezione Avanzate al click', async () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /avanzate/i }));
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it("mostra badge 'modificato' quando c'è un override", () => {
    const overrides: PhraseMemoryOverrides = { maxResults: 3 };
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={overrides}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /avanzate/i }));
    expect(screen.getAllByText(/modificato/i)[0]).toBeInTheDocument();
  });
});
