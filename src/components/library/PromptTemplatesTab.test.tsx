import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { PromptTemplatesTab } from './PromptTemplatesTab';

vi.mock('../../hooks/useProviderKeyStatus', () => ({ useProviderKeyStatus: () => ({ statuses: {} }), canRefineWithProvider: () => false }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const updateTemplate = vi.fn().mockResolvedValue(undefined);
const saveTemplate = vi.fn().mockResolvedValue(undefined);
const template = { id: 'ocr-1', name: 'Manoscritto', prompt: 'Trascrivi fedelmente.', context: 'ocr' as const,
  workflow: 'transcription' as const, defaultProvider: 'ollama', defaultModel: 'local-custom', createdAt: '2026-10-03' };

describe('Prompt templates resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePromptTemplateStore.setState({ isLoaded: true, templates: [template,
      { ...template, id: 'stage-1', name: 'Traduzione', context: 'stage', workflow: 'translation', prompt: 'Translate.' }], updateTemplate, saveTemplate });
  });
  it('filters OCR templates and searches their prompt text', async () => {
    render(<PromptTemplatesTab />);
    await userEvent.click(screen.getByRole('tab', { name: 'workspace.settings.ocrTab' }));
    expect(screen.queryByText('Traduzione')).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'fedelmente');
    expect(screen.getByText('Manoscritto')).toBeInTheDocument();
  });
  it('edits the same template, preserving scope, workflow and an unavailable local model', async () => {
    render(<PromptTemplatesTab />);
    await userEvent.click(screen.getByRole('button', { name: 'common.edit: Manoscritto' }));
    const field = screen.getByLabelText('library.templateNameLabel');
    await userEvent.clear(field);
    await userEvent.type(field, 'Manoscritto corretto');
    await userEvent.click(screen.getByRole('button', { name: 'library.saveTemplate' }));
    await waitFor(() => expect(updateTemplate).toHaveBeenCalledWith('ocr-1', {
      name: 'Manoscritto corretto', prompt: 'Trascrivi fedelmente.', context: 'ocr', workflow: 'transcription', defaultProvider: 'ollama', defaultModel: 'local-custom',
    }));
    expect(saveTemplate).not.toHaveBeenCalled();
  });
  it('keeps edits visible when saving fails', async () => {
    updateTemplate.mockRejectedValueOnce(new Error('disk full'));
    render(<PromptTemplatesTab />);
    await userEvent.click(screen.getByRole('button', { name: 'common.edit: Manoscritto' }));
    await userEvent.click(screen.getByRole('button', { name: 'library.saveTemplate' }));
    await waitFor(() => expect(updateTemplate).toHaveBeenCalled());
    expect(screen.getByLabelText('library.templateNameLabel')).toHaveValue('Manoscritto');
  });
});
