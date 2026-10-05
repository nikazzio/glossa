import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineConfig, PromptInfo } from '../../types';
import { PromptPreviewTab } from './PromptPreviewTab';

const llm = vi.hoisted(() => ({
  previewStagePrompt: vi.fn(),
  previewJudgePrompt: vi.fn(),
  previewCoherencePrompt: vi.fn(),
  systemTexts: vi.fn(),
}));
vi.mock('../../services/llmService', () => ({ llmService: llm }));
vi.mock('../../services/deeplService', () => ({ deeplService: { previewDeeplStage: vi.fn().mockResolvedValue('{}') } }));

const config: PipelineConfig = {
  pipelineId: 'p1',
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
    { id: 'role', textId: 'translation.role', message: 'system', cacheable: true, text: 'You are a translator.' },
    { id: 'stage-prompt', message: 'system', cacheable: false, text: 'Core Instructions:\nTranslate.' },
    { id: 'user-message', textId: 'translation.user-message', message: 'user', cacheable: false, text: 'Text:\n{{SOURCE_CHUNK_TEXT}}' },
  ],
};

describe('PromptPreviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llm.previewStagePrompt.mockResolvedValue(stagePreview);
    llm.previewJudgePrompt.mockResolvedValue({ systemPrompt: '', userPrompt: '', parts: [] });
    llm.systemTexts.mockResolvedValue([{ id: 'translation.role', defaultText: 'You are a translator.', required: [] }]);
  });

  it('shows the parts sent by the backend, in order, with their kind', async () => {
    render(<PromptPreviewTab config={config} setConfig={vi.fn()} onOpenSection={vi.fn()} />);
    expect(await screen.findByText('You are a translator.')).toBeInTheDocument();
    expect(screen.getByText(/Core Instructions:/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('pipeline.promptParts.kind.system').length).toBeGreaterThan(0);
  });

  it('keeps absent parts visible with the reason they are missing', async () => {
    render(<PromptPreviewTab config={config} setConfig={vi.fn()} onOpenSection={vi.fn()} />);
    await screen.findByText('You are a translator.');
    expect(screen.getByText(/pipeline\.promptParts\.reason\.notMarkdown/)).toBeInTheDocument();
    expect(screen.getByText(/pipeline\.promptParts\.reason\.noExamples/)).toBeInTheDocument();
  });

  it('asks the backend for the audit request when Audit is chosen', async () => {
    render(<PromptPreviewTab config={config} setConfig={vi.fn()} onOpenSection={vi.fn()} />);
    const tabs = screen.getByRole('tablist', { name: 'pipeline.promptPreviewTitle' });
    await userEvent.click(within(tabs).getByRole('tab', { name: 'pipeline.auditPreviewLabel' }));
    expect(llm.previewJudgePrompt).toHaveBeenCalledWith('{{SOURCE_CHUNK_TEXT}}', '{{TRANSLATION}}', config);
  });

  it('keeps system texts locked until the lock is opened', async () => {
    render(<PromptPreviewTab config={config} setConfig={vi.fn()} onOpenSection={vi.fn()} />);
    await screen.findByText('You are a translator.');
    const unlock = await screen.findAllByRole('button', { name: 'pipeline.promptParts.unlock' });
    expect(screen.queryByRole('button', { name: 'common.edit' })).not.toBeInTheDocument();
    await userEvent.click(unlock[0]);
    expect(screen.getByRole('button', { name: 'pipeline.promptParts.lock' })).toBeInTheDocument();
  });

  it('switches an optional piece off for this phase only', async () => {
    const setConfig = vi.fn();
    render(<PromptPreviewTab config={config} setConfig={setConfig} onOpenSection={vi.fn()} />);
    await screen.findByText('You are a translator.');
    await userEvent.click(screen.getAllByRole('button', { name: 'pipeline.promptParts.switchOff' })[0]);
    const update = setConfig.mock.calls[0][0] as (prev: PipelineConfig) => PipelineConfig;
    expect(update(config).promptComposition?.disabled).toEqual(['translation:role']);
  });
});
