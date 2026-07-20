import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkPromptPreviewTab } from './ChunkPromptPreviewTab';
import { useChunkPromptPreview } from '../../../hooks/useChunkPromptPreview';
import { makeTranslationChunk } from '../../../test/chunkFactory';

vi.mock('../../../hooks/useChunkPromptPreview', () => ({
  useChunkPromptPreview: vi.fn(),
}));
vi.mock('../../../stores/pipelineStore', () => ({
  usePipelineStore: (selector: (s: unknown) => unknown) =>
    selector({
      config: {
        stages: [
          { id: 'stage-1', name: 'Traduzione', enabled: true, provider: 'openai' },
          { id: 'stage-2', name: 'DeepL', enabled: true, provider: 'deepl' },
        ],
      },
    }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUsePreview = vi.mocked(useChunkPromptPreview);

function basePreviewState() {
  return {
    preview: null,
    isBuilding: false,
    error: null,
    isDeeplStage: false,
    build: vi.fn(),
    reset: vi.fn(),
  };
}

describe('ChunkPromptPreviewTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra lo stato vuoto quando non c\'è un chunk selezionato', () => {
    mockUsePreview.mockReturnValue(basePreviewState());
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={null} />);
    expect(screen.getByText('promptPreview.emptyNoChunk')).toBeInTheDocument();
  });

  it('avvisa che la fase DeepL non genera un messaggio testuale', () => {
    mockUsePreview.mockReturnValue({ ...basePreviewState(), isDeeplStage: true });
    const chunk = makeTranslationChunk({ id: 'c1' });
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('promptPreview.deeplNotice')).toBeInTheDocument();
  });

  it('mostra i blocchi sistema e utente quando l\'anteprima è pronta', () => {
    mockUsePreview.mockReturnValue({
      ...basePreviewState(),
      preview: { systemPrompt: 'SYS TEXT', userPrompt: 'USER TEXT' },
    });
    const chunk = makeTranslationChunk({ id: 'c1' });
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('SYS TEXT')).toBeInTheDocument();
    expect(screen.getByText('USER TEXT')).toBeInTheDocument();
  });

  it('chiama build con la fase selezionata quando si preme il pulsante', async () => {
    const build = vi.fn();
    mockUsePreview.mockReturnValue({ ...basePreviewState(), build });
    const chunk = makeTranslationChunk({ id: 'c1' });
    const user = userEvent.setup();
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    await user.click(screen.getByRole('button', { name: 'promptPreview.buildButton' }));
    expect(build).toHaveBeenCalledWith('stage-1');
  });
});
