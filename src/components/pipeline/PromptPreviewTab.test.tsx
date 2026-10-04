import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineConfig, PromptInfo } from '../../types';
import { PromptPreviewTab } from './PromptPreviewTab';

const llm = vi.hoisted(() => ({
  previewStagePrompt: vi.fn(),
  previewJudgePrompt: vi.fn(),
  previewCoherencePrompt: vi.fn(),
}));
vi.mock('../../services/llmService', () => ({ llmService: llm }));
vi.mock('../../services/deeplService', () => ({ deeplService: { previewDeeplStage: vi.fn().mockResolvedValue('{}') } }));

const config: PipelineConfig = {
  pipelineId: 'p1',
  sourceLanguage: 'English',
  targetLanguage: 'Italian',
  stages: [
    { id: 'stg-translation', name: 'Translation', role: 'translation', prompt: 'Translate.', model: 'm', provider: 'openai', enabled: true },
  ],
  judgePrompt: 'Judge.',
  judgeModel: 'm',
  judgeProvider: 'openai',
  glossary: [],
  markdownAware: false,
};

const stagePreview: PromptInfo = {
  systemPrompt: '',
  userPrompt: '',
  parts: [
    { id: 'role', message: 'system', cacheable: true, text: 'You are a translator.' },
    { id: 'stage-prompt', message: 'system', cacheable: false, text: 'Core Instructions:\nTranslate.' },
    { id: 'chunk-text', message: 'user', cacheable: false, text: 'Text:\n{{SOURCE_CHUNK_TEXT}}\n\n' },
  ],
};

describe('PromptPreviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llm.previewStagePrompt.mockResolvedValue(stagePreview);
    llm.previewJudgePrompt.mockResolvedValue({ systemPrompt: '', userPrompt: '', parts: [] });
  });

  it('shows the parts sent by the backend, in order, with their kind', async () => {
    render(<PromptPreviewTab config={config} />);
    expect(await screen.findByText('You are a translator.')).toBeInTheDocument();
    expect(screen.getByText(/Core Instructions:/)).toBeInTheDocument();
    expect(screen.getAllByText('pipeline.promptParts.kind.fixed').length).toBeGreaterThan(0);
  });

  it('keeps absent parts visible with the reason they are missing', async () => {
    render(<PromptPreviewTab config={config} />);
    await screen.findByText('You are a translator.');
    expect(screen.getByText(/pipeline\.promptParts\.reason\.notMarkdown/)).toBeInTheDocument();
    expect(screen.getByText(/pipeline\.promptParts\.reason\.noExamples/)).toBeInTheDocument();
  });

  it('asks the backend for the audit request when Audit is chosen', async () => {
    render(<PromptPreviewTab config={config} />);
    const tabs = screen.getByRole('tablist', { name: 'pipeline.promptPreviewTitle' });
    await userEvent.click(within(tabs).getByRole('tab', { name: 'pipeline.auditPreviewLabel' }));
    expect(llm.previewJudgePrompt).toHaveBeenCalledWith('{{SOURCE_CHUNK_TEXT}}', '{{TRANSLATION}}', config);
  });
});
