import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
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
    vi.resetAllMocks();

    usePipelineStore.setState((state) => ({
      ...state,
      inputText: '',
      config: {
        ...state.config,
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
      },
    }));

    useChunksStore.setState({
      chunks: [
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
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });
  });

  it('skips already completed chunks during batch runs', async () => {
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk, index) =>
        index === 0
          ? {
              ...chunk,
              status: 'completed',
              currentDraft: 'Already translated',
              stageResults: {
                'stg-1': { content: 'Already translated', status: 'completed' },
              },
              judgeResult: {
                content: 'Already translated',
                status: 'completed',
                rating: 'good',
                issues: [],
              },
            }
          : chunk,
      ),
    );

    llmMocks.runStageStream.mockResolvedValue('Second translated');
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('Already translated');
    expect(useChunksStore.getState().chunks[1].currentDraft).toBe('Second translated');
  });

  it('retranslates only the requested chunk', async () => {
    llmMocks.runStageStream.mockResolvedValue('Translated only chunk-1');
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-1');
    });

    expect(llmMocks.runStageStream).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('');
    expect(useChunksStore.getState().chunks[1].currentDraft).toBe(
      'Translated only chunk-1',
    );
  });

  it('re-audits only the targeted chunk', async () => {
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk, index) => ({
        ...chunk,
        currentDraft: `draft-${index}`,
      })),
    );

    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.auditSingleChunk('chunk-1');
    });

    expect(llmMocks.runStageStream).not.toHaveBeenCalled();
    expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[1].judgeResult.rating).toBe('excellent');
  });

  it('treats stream cancellation as cancellation, not failure', async () => {
    llmMocks.runStageStream.mockRejectedValueOnce(new Error('Stream cancelled'));

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalledWith('pipeline.stopConfirmed');
    expect(useChunksStore.getState().chunks[0].status).toBe('ready');
  });

  it('requests backend cancellation for active streams', () => {
    useChunksStore.getState().setActiveStreamId('stream-xyz');
    llmMocks.cancelStream.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePipeline());
    act(() => {
      result.current.cancelPipeline();
    });

    expect(llmMocks.cancelStream).toHaveBeenCalledWith('stream-xyz');
    expect(useChunksStore.getState().cancelRequested).toBe(true);
  });
});
