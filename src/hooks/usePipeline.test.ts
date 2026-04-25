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
    // Use resetAllMocks (not clearAllMocks) so mockResolvedValueOnce /
    // mockImplementationOnce queues from a previous test cannot leak
    // into the next one.
    vi.resetAllMocks();

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

  it('clears stale stage results when re-processing a chunk', async () => {
    // Pre-seed chunk-0 with a leftover stage-2 result from a previous
    // failed run. The new run only has stg-1 enabled, but the stale
    // stg-2 entry must not survive into the new attempt.
    usePipelineStore.getState().setChunks((prev) =>
      prev.map((c, i) =>
        i === 0
          ? {
              ...c,
              status: 'ready' as const,
              stageResults: {
                'stg-stale': { content: 'leftover output', status: 'completed' as const },
              },
            }
          : c,
      ),
    );

    llmMocks.runStageStream.mockResolvedValue('Fresh translation');
    llmMocks.judgeTranslation.mockResolvedValue({
      content: 'Fresh translation', rating: 'good', issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    const chunk0 = usePipelineStore.getState().chunks[0];
    expect(chunk0.stageResults['stg-stale']).toBeUndefined();
    expect(chunk0.stageResults['stg-1']?.content).toBe('Fresh translation');
  });

  it('reads chunks from the store at invocation time, not from the stale closure', async () => {
    // Render the hook with chunks all in 'ready'
    const { result } = renderHook(() => usePipeline());

    // Mark every chunk completed AFTER the hook captured its closure,
    // simulating the "Re-run all" sequence (resetCompletedChunks then
    // immediately invoke runPipeline before React rerenders).
    usePipelineStore.getState().setChunks((prev) =>
      prev.map((c) => ({
        ...c,
        status: 'completed' as const,
        currentDraft: 'old',
      })),
    );

    // Now mutate the live store back to ready, mimicking what
    // resetCompletedChunks would do — but the hook closure still
    // remembers the original 'ready' chunks. If runPipeline reads
    // from the closure, it will overwrite the 'old' drafts; if it
    // reads from getState() correctly, it will see 'completed' and
    // skip them.
    usePipelineStore.getState().setChunks((prev) =>
      prev.map((c) => ({ ...c, status: 'completed' as const })),
    );

    llmMocks.runStageStream.mockResolvedValue('should not be called');

    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).not.toHaveBeenCalled();
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

  it('stops audit-only runs before the next chunk when cancel is requested', async () => {
    usePipelineStore.getState().setChunks((prev) =>
      prev.map((c, index) => ({
        ...c,
        currentDraft: index === 0 ? 'Draft 0' : 'Draft 1',
        status: 'completed' as const,
      })),
    );

    llmMocks.judgeTranslation
      .mockImplementationOnce(async () => {
        usePipelineStore.getState().requestCancel();
        return { content: '', rating: 'good', issues: [] };
      })
      .mockResolvedValueOnce({ content: '', rating: 'good', issues: [] });

    const { result } = renderHook(() => usePipeline());

    await act(async () => {
      await result.current.runAuditOnly();
    });

    expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
    expect(toast.message).toHaveBeenCalledWith('pipeline.stopConfirmed');
    expect(usePipelineStore.getState().chunks[1].judgeResult.status).toBe('idle');
    expect(usePipelineStore.getState().cancelRequested).toBe(false);
  });

  describe('runSingleChunk', () => {
    it('translates only the targeted chunk and leaves siblings untouched', async () => {
      llmMocks.runStageStream.mockResolvedValue('Translated only chunk-1');
      llmMocks.judgeTranslation.mockResolvedValue({
        content: '', rating: 'good', issues: [],
      });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('chunk-1');
      });

      expect(llmMocks.runStageStream).toHaveBeenCalledTimes(1);
      expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
      expect(usePipelineStore.getState().chunks[0].currentDraft).toBe('');
      expect(usePipelineStore.getState().chunks[0].status).toBe('ready');
      expect(usePipelineStore.getState().chunks[1].currentDraft).toBe('Translated only chunk-1');
      expect(usePipelineStore.getState().chunks[1].status).toBe('completed');
    });

    it('redoes a chunk even if it was already completed (no skip)', async () => {
      // Pre-seed chunk-0 as completed with old data.
      usePipelineStore.getState().setChunks((prev) =>
        prev.map((c, i) =>
          i === 0
            ? { ...c, status: 'completed' as const, currentDraft: 'OLD' }
            : c,
        ),
      );

      llmMocks.runStageStream.mockResolvedValue('NEW');
      llmMocks.judgeTranslation.mockResolvedValue({
        content: '', rating: 'good', issues: [],
      });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('chunk-0');
      });

      expect(llmMocks.runStageStream).toHaveBeenCalledTimes(1);
      expect(usePipelineStore.getState().chunks[0].currentDraft).toBe('NEW');
    });

    it('is a no-op when isProcessing is already true', async () => {
      usePipelineStore.getState().setIsProcessing(true);

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('chunk-0');
      });

      expect(llmMocks.runStageStream).not.toHaveBeenCalled();
      expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    });

    it('does nothing if the chunk id is unknown', async () => {
      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('does-not-exist');
      });
      expect(llmMocks.runStageStream).not.toHaveBeenCalled();
      expect(usePipelineStore.getState().isProcessing).toBe(false);
    });

    it('does not report success when no stage produces output', async () => {
      llmMocks.runStageStream.mockResolvedValue('');

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('chunk-0');
      });

      expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
      expect(usePipelineStore.getState().chunks[0].status).toBe('ready');
      expect(usePipelineStore.getState().chunks[0].currentDraft).toBe('');
      expect(toast.success).not.toHaveBeenCalledWith('pipeline.singleChunkCompleted');
    });
  });

  describe('auditSingleChunk', () => {
    it('runs only the judge for the targeted chunk', async () => {
      // Both chunks already have a draft — only chunk-1 should be re-audited.
      usePipelineStore.getState().setChunks((prev) =>
        prev.map((c, i) => ({
          ...c,
          currentDraft: i === 0 ? 'Draft 0' : 'Draft 1',
          status: 'completed' as const,
        })),
      );

      llmMocks.judgeTranslation.mockResolvedValue({
        content: '', rating: 'excellent', issues: [],
      });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.auditSingleChunk('chunk-1');
      });

      expect(llmMocks.runStageStream).not.toHaveBeenCalled();
      expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
      expect(usePipelineStore.getState().chunks[0].judgeResult.rating).toBe('fair'); // untouched
      expect(usePipelineStore.getState().chunks[1].judgeResult.rating).toBe('excellent');
    });

    it('marks the chunk as processing while the audit request is in flight', async () => {
      usePipelineStore.getState().setChunks((prev) =>
        prev.map((c, i) => ({
          ...c,
          currentDraft: i === 0 ? 'Draft 0' : '',
          status: i === 0 ? 'completed' as const : c.status,
        })),
      );

      const observedStatuses: string[] = [];
      llmMocks.judgeTranslation.mockImplementation(async () => {
        observedStatuses.push(usePipelineStore.getState().chunks[0].status);
        return { content: '', rating: 'excellent', issues: [] };
      });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.auditSingleChunk('chunk-0');
      });

      expect(observedStatuses).toEqual(['processing']);
      expect(usePipelineStore.getState().chunks[0].status).toBe('completed');
    });

    it('does nothing when the targeted chunk has no draft', async () => {
      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.auditSingleChunk('chunk-0');
      });
      expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
      expect(toast.message).toHaveBeenCalledWith('pipeline.auditSkippedNoDraft');
    });

    it('is a no-op when isProcessing is already true', async () => {
      usePipelineStore.getState().setIsProcessing(true);
      usePipelineStore.getState().setChunks((prev) =>
        prev.map((c) => ({ ...c, currentDraft: 'Draft' })),
      );

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.auditSingleChunk('chunk-0');
      });

      expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    });
  });
});
