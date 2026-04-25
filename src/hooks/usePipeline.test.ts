import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { usePipelineStore } from '../stores/pipelineStore';
import { usePipeline } from './usePipeline';

const llmMocks = vi.hoisted(() => ({
  runStageStream: vi.fn(),
  judgeTranslation: vi.fn(),
  cancelStream: vi.fn(),
}));

vi.mock('../services/llmService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/llmService')>(
      '../services/llmService',
    );
  return {
    ...actual,
    llmService: llmMocks,
  };
});

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

  it('skips chunks that are already completed', async () => {
    // chunk-0 is already done with a translation; only chunk-1 should run.
    usePipelineStore.getState().setChunks((prev) =>
      prev.map((c, i) =>
        i === 0
          ? {
              ...c,
              status: 'completed' as const,
              currentDraft: 'Already translated',
              stageResults: {
                'stg-1': { content: 'Already translated', status: 'completed' as const },
              },
              judgeResult: { content: 'Already translated', status: 'completed' as const, rating: 'good', issues: [] },
            }
          : c,
      ),
    );

    llmMocks.runStageStream.mockResolvedValue('Second translated');
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '', rating: 'good', issues: [],
    });

    const { result } = renderHook(() => usePipeline());

    await act(async () => {
      await result.current.runPipeline();
    });

    // Only chunk-1 produces a stream call; chunk-0 was skipped.
    expect(llmMocks.runStageStream).toHaveBeenCalledTimes(1);
    expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
    expect(usePipelineStore.getState().chunks[0].currentDraft).toBe('Already translated');
    expect(usePipelineStore.getState().chunks[0].status).toBe('completed');
    expect(usePipelineStore.getState().chunks[1].currentDraft).toBe('Second translated');
  });

  it('is a no-op when runPipeline is invoked while already processing', async () => {
    usePipelineStore.getState().setIsProcessing(true);

    const { result } = renderHook(() => usePipeline());

    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).not.toHaveBeenCalled();
    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    expect(usePipelineStore.getState().isProcessing).toBe(true);
  });

  it('is a no-op when runAuditOnly is invoked while already processing', async () => {
    usePipelineStore.getState().setIsProcessing(true);
    usePipelineStore.getState().setChunks((prev) =>
      prev.map((c) => ({ ...c, currentDraft: 'draft' })),
    );

    const { result } = renderHook(() => usePipeline());

    await act(async () => {
      await result.current.runAuditOnly();
    });

    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    expect(usePipelineStore.getState().isProcessing).toBe(true);
  });

  it('treats a "Stream cancelled" rejection as cancellation, not a failure', async () => {
    llmMocks.runStageStream.mockRejectedValueOnce(new Error('Stream cancelled'));

    const { result } = renderHook(() => usePipeline());

    await act(async () => {
      await result.current.runPipeline();
    });

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalledWith('pipeline.stopConfirmed');
    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    expect(usePipelineStore.getState().chunks[1].currentDraft).toBe('');
    expect(usePipelineStore.getState().isProcessing).toBe(false);
    // Chunk status must not be left stuck on 'processing' after cancel
    expect(usePipelineStore.getState().chunks[0].status).toBe('ready');
  });

  it('invokes cancel_stream on the backend when cancelPipeline runs', () => {
    usePipelineStore.getState().setActiveStreamId('stream-xyz');
    llmMocks.cancelStream.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePipeline());

    act(() => {
      result.current.cancelPipeline();
    });

    expect(llmMocks.cancelStream).toHaveBeenCalledWith('stream-xyz');
    expect(usePipelineStore.getState().cancelRequested).toBe(true);
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
