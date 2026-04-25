import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineStore } from '../stores/pipelineStore';
import { usePipeline } from './usePipeline';

const llmMocks = vi.hoisted(() => ({
  runStageStream: vi.fn(),
  judgeTranslation: vi.fn(),
}));

vi.mock('../services/llmService', () => ({
  llmService: llmMocks,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

describe('usePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const store = usePipelineStore.getState();
    store.setInputText('');
    store.clearChunks();
    store.setIsProcessing(false);
    store.clearCancelRequest();
    store.setConfig((prev) => ({
      ...prev,
      stages: [
        {
          id: 'stg-1',
          name: 'Stage 1',
          prompt: 'Translate',
          model: 'gemini-3-flash-preview',
          provider: 'gemini',
          enabled: true,
        },
      ],
      judgePrompt: 'Judge',
      judgeModel: 'gemini-3-flash-preview',
      judgeProvider: 'gemini',
    }));
    store.setChunks([
      {
        id: 'chunk-0',
        originalText: 'First',
        status: 'ready',
        stageResults: {},
        judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
        currentDraft: '',
      },
      {
        id: 'chunk-1',
        originalText: 'Second',
        status: 'ready',
        stageResults: {},
        judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
        currentDraft: '',
      },
    ]);
  });

  it('stops after the current chunk when cancel is requested', async () => {
    llmMocks.runStageStream
      .mockImplementationOnce(async () => {
        usePipelineStore.getState().requestCancel();
        return 'First translated';
      })
      .mockResolvedValueOnce('Second translated');
    llmMocks.judgeTranslation.mockResolvedValue({
      content: 'First translated',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());

    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).toHaveBeenCalledTimes(1);
    expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
    expect(usePipelineStore.getState().chunks[0].currentDraft).toBe('First translated');
    expect(usePipelineStore.getState().chunks[1].currentDraft).toBe('');
    expect(usePipelineStore.getState().isProcessing).toBe(false);
    expect(usePipelineStore.getState().cancelRequested).toBe(false);
  });
});
