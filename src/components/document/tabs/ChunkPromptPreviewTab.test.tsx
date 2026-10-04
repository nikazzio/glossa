import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkPromptPreviewTab } from './ChunkPromptPreviewTab';
import { useChunkPromptPreview } from '../../../hooks/useChunkPromptPreview';
import { makeTranslationChunk } from '../../../test/chunkFactory';

vi.mock('../../../hooks/useChunkPromptPreview', () => ({
  useChunkPromptPreview: vi.fn(),
  AUDIT_PREVIEW_ID: 'preview-audit',
  COHERENCE_PREVIEW_ID: 'preview-coherence',
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

  it('mostra per la fase DeepL solo il corpo della richiesta, senza messaggio di sistema', () => {
    mockUsePreview.mockReturnValue({
      ...basePreviewState(),
      isDeeplStage: true,
      preview: { systemPrompt: '', userPrompt: '{"text":["Hello"]}' },
    });
    const chunk = makeTranslationChunk({ id: 'c1' });
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('pipeline.deepl.requestBody')).toBeInTheDocument();
    expect(screen.queryByText('promptPreview.systemLabel')).not.toBeInTheDocument();
  });

  it('offre audit e coerenza per un frammento tradotto e li costruisce con l\'id della verifica', async () => {
    const build = vi.fn();
    mockUsePreview.mockReturnValue({ ...basePreviewState(), build });
    const chunk = makeTranslationChunk({ id: 'c1', translationProcessingText: 'Ciao' });
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    await userEvent.selectOptions(screen.getByLabelText('promptPreview.stageLabel'), 'preview-coherence');
    await userEvent.click(screen.getByRole('button', { name: 'promptPreview.buildButton' }));
    expect(build).toHaveBeenCalledWith('preview-coherence');
  });

  it('spegne audit e coerenza quando il frammento non è ancora tradotto', () => {
    mockUsePreview.mockReturnValue(basePreviewState());
    const chunk = makeTranslationChunk({ id: 'c1', translationProcessingText: '' });
    render(<ChunkPromptPreviewTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    const select = screen.getByLabelText('promptPreview.stageLabel') as HTMLSelectElement;
    const review = Array.from(select.options).filter((option) => option.value.startsWith('preview-'));
    expect(review.map((option) => option.disabled)).toEqual([true, true]);
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
