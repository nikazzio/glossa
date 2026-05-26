import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { useUiStore } from '../stores/uiStore';
import { makeTranslationChunk } from '../test/chunkFactory';
import { usePipeline } from './usePipeline';

const llmMocks = vi.hoisted(() => ({
  runStage: vi.fn(),
  runStageStream: vi.fn(),
  judgeTranslation: vi.fn(),
  runCoherenceForChunk: vi.fn(),
  computeBlobs: vi.fn(),
  cancelStream: vi.fn(),
  preflightPipeline: vi.fn(),
}));

const ollamaMocks = vi.hoisted(() => ({
  checkPreflight: vi.fn(),
}));

const preflightMocks = vi.hoisted(() => ({
  showPreflightDialog: vi.fn(),
}));

vi.mock('../services/llmService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/llmService')>(
      '../services/llmService',
    );
  return {
    ...actual,
    llmService: llmMocks,
    ollamaService: ollamaMocks,
  };
});

vi.mock('../stores/preflightStore', () => ({
  showPreflightDialog: preflightMocks.showPreflightDialog,
  usePreflightStore: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    loading: vi.fn().mockReturnValue('toast-id'),
    dismiss: vi.fn(),
  },
}));

describe('usePipeline', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (toast.loading as ReturnType<typeof vi.fn>).mockReturnValue('toast-id');
    llmMocks.preflightPipeline.mockResolvedValue([]);
    llmMocks.computeBlobs.mockResolvedValue([]);
    llmMocks.runCoherenceForChunk.mockResolvedValue({ issues: [] });
    preflightMocks.showPreflightDialog.mockResolvedValue(true);

    useUiStore.setState({ pipelineMode: 'document' });
    usePipelineStore.setState((state) => ({
      ...state,
      activePipelineId: 'cfg-proj-test',
      runStatus: 'idle',
      lastRunConfig: null,
      inputText: '',
      inputProcessingText: '',
      sourceFootnotes: [],
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
        makeTranslationChunk({
          id: 'chunk-0',
          originalText: 'First',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
          currentDraft: '',
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          originalText: 'Second',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
          currentDraft: '',
        }),
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

    llmMocks.runStage.mockResolvedValue({ content: 'Second translated' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('Already translated');
    expect(useChunksStore.getState().chunks[1].currentDraft).toBe('Second translated');
  });

  it('re-runs completed chunks on a new batch round unless they are locked', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      runStatus: 'completed',
    }));
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'chunk-0',
          originalText: 'First',
          status: 'completed',
          currentDraft: 'Keep me',
          translationDisplayText: 'Keep me',
          translationProcessingText: 'Keep me',
          translationLocked: true,
          stageResults: {
            'stg-1': { content: 'Keep me', status: 'completed' },
          },
          judgeResult: { content: 'Keep me', status: 'completed', rating: 'good', issues: [] },
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          originalText: 'Second',
          status: 'completed',
          currentDraft: 'Old translation',
          translationDisplayText: 'Old translation',
          translationProcessingText: 'Old translation',
          translationLocked: false,
          stageResults: {
            'stg-1': { content: 'Old translation', status: 'completed' },
          },
          judgeResult: { content: 'Old translation', status: 'completed', rating: 'good', issues: [] },
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    llmMocks.runStage.mockResolvedValue({ content: 'Second retranslated' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('Keep me');
    expect(useChunksStore.getState().chunks[1].currentDraft).toBe('Second retranslated');
    expect(usePipelineStore.getState().runStatus).toBe('completed');
  });

  it('retranslates only the requested chunk', async () => {
    llmMocks.runStage.mockResolvedValue({ content: 'Translated only chunk-1' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-1');
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('');
    expect(useChunksStore.getState().chunks[1].currentDraft).toBe(
      'Translated only chunk-1',
    );
  });

  it('re-audits only the targeted chunk', async () => {
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk, index) => ({
        ...chunk,
        translationDisplayText: `draft-${index}`,
        translationProcessingText: `draft-${index}`,
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

    expect(llmMocks.runStage).not.toHaveBeenCalled();
    expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(1);
    expect(useChunksStore.getState().chunks[1].judgeResult.rating).toBe('excellent');
  });

  it('treats stream cancellation as cancellation, not failure', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [{ id: 'stg-1', name: 'Stage 1', prompt: 'Translate', model: 'llama3.2', provider: 'ollama', enabled: true }],
      },
    }));
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

  it('stops a non-streaming provider request without continuing to later stages or audit', async () => {
    let rejectStage: ((error: Error) => void) | null = null;
    llmMocks.runStage.mockImplementationOnce(() => {
      useChunksStore.getState().setActiveStreamId('stream-non-streaming');
      return new Promise((_resolve, reject) => {
        rejectStage = (error) => {
          useChunksStore.getState().setActiveStreamId(null);
          reject(error);
        };
      });
    });
    llmMocks.cancelStream.mockImplementationOnce(async () => {
      rejectStage?.(new Error('Stream cancelled'));
    });

    const { result } = renderHook(() => usePipeline());
    let runPromise!: Promise<void>;
    await act(async () => {
      runPromise = result.current.runPipeline();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(useChunksStore.getState().activeStreamId).toBeTruthy();
    });

    act(() => {
      result.current.cancelPipeline();
    });

    await act(async () => {
      await runPromise;
    });

    expect(llmMocks.cancelStream).toHaveBeenCalledTimes(1);
    expect(llmMocks.runStage).toHaveBeenCalledTimes(1);
    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    expect(useChunksStore.getState().chunks[0].status).toBe('ready');
    expect(useChunksStore.getState().chunks[1].status).toBe('ready');
    expect(toast.message).toHaveBeenCalledWith('pipeline.stopConfirmed');
  });

  it('blocks the run when Ollama is offline', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [
          {
            id: 'stg-1',
            name: 'Stage 1',
            prompt: 'Translate',
            model: 'llama3.2',
            provider: 'ollama',
            enabled: true,
          },
        ],
      },
    }));
    llmMocks.preflightPipeline.mockResolvedValueOnce([
      { provider: 'ollama', model: 'llama3.2', label: 'Stage 1 — ollama llama3.2', ok: false, error: 'Ollama is not running' },
    ]);
    preflightMocks.showPreflightDialog.mockResolvedValueOnce(false);

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).not.toHaveBeenCalled();
    expect(preflightMocks.showPreflightDialog).toHaveBeenCalled();
  });

  it('blocks the run when the configured Ollama model is missing', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [
          {
            id: 'stg-1',
            name: 'Stage 1',
            prompt: 'Translate',
            model: 'llama3.2',
            provider: 'ollama',
            enabled: true,
          },
        ],
      },
    }));
    llmMocks.preflightPipeline.mockResolvedValueOnce([
      { provider: 'ollama', model: 'llama3.2', label: 'Stage 1 — ollama llama3.2', ok: false, error: 'Model "llama3.2" is not installed locally' },
    ]);
    preflightMocks.showPreflightDialog.mockResolvedValueOnce(false);

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).not.toHaveBeenCalled();
    expect(preflightMocks.showPreflightDialog).toHaveBeenCalled();
  });

  it('shows a friendly toast when preflight pipeline call throws', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [
          {
            id: 'stg-1',
            name: 'Stage 1',
            prompt: 'Translate',
            model: 'llama3.2',
            provider: 'ollama',
            enabled: true,
          },
        ],
      },
    }));
    llmMocks.preflightPipeline.mockRejectedValueOnce(new Error('invoke failed'));

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStageStream).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('passes stage 1 output as previousResult to stage 2', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
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
          {
            id: 'stg-2',
            name: 'Stage 2',
            prompt: 'Refine',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
        ],
      },
    }));

    llmMocks.runStage
      .mockResolvedValueOnce({ content: 'Stage 1 output' })
      .mockResolvedValueOnce({ content: 'Stage 2 output' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-0');
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(2);
    const stage2Call = llmMocks.runStage.mock.calls[1];
    expect(stage2Call[3]).toBe('Stage 1 output');
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('Stage 2 output');
  });

  it('passes refine output as format input without previousResult', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [
          {
            id: 'stg-translation',
            name: 'Translation',
            role: 'translation',
            prompt: 'Translate',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
          {
            id: 'stg-refine',
            name: 'Refine',
            role: 'refine',
            prompt: 'Refine',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
          {
            id: 'stg-format',
            name: 'Format',
            role: 'format',
            prompt: 'Fix formatting only',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
        ],
      },
    }));

    llmMocks.runStage
      .mockResolvedValueOnce({ content: 'Translation output' })
      .mockResolvedValueOnce({ content: 'Refined output' })
      .mockResolvedValueOnce({ content: 'Formatted output' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-0');
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(3);
    const formatCall = llmMocks.runStage.mock.calls[2];
    expect(formatCall[0]).toBe('Refined output');
    expect(formatCall[3]).toBeUndefined();
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('Formatted output');
    expect(llmMocks.judgeTranslation.mock.calls[0][1]).toBe('Formatted output');
  });

  it('uses the previous stage output when format returns empty content', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [
          {
            id: 'stg-translation',
            name: 'Translation',
            role: 'translation',
            prompt: 'Translate',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
          {
            id: 'stg-refine',
            name: 'Refine',
            role: 'refine',
            prompt: 'Refine',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
          {
            id: 'stg-format',
            name: 'Format',
            role: 'format',
            prompt: 'Fix formatting only',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
        ],
      },
    }));

    llmMocks.runStage
      .mockResolvedValueOnce({ content: 'Translation output' })
      .mockResolvedValueOnce({ content: 'Refined output' })
      .mockResolvedValueOnce({ content: ' \n ' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-0');
    });

    const chunk = useChunksStore.getState().chunks[0];
    expect(chunk.currentDraft).toBe('Refined output');
    expect(chunk.stageResults['stg-format']?.content).toBe('Refined output');
    expect(llmMocks.judgeTranslation.mock.calls[0][1]).toBe('Refined output');
  });

  it('keeps the stage blob context stable and selects the current chunk separately', async () => {
    const assignments = [
      { chunkId: 'chunk-0', blobId: 'blob-1', position: 0, referenceChunkIds: ['chunk-0', 'chunk-1'] },
      { chunkId: 'chunk-1', blobId: 'blob-1', position: 1, referenceChunkIds: ['chunk-0', 'chunk-1'] },
    ];
    llmMocks.computeBlobs.mockResolvedValueOnce(assignments);
    llmMocks.runStage.mockResolvedValue({ content: 'Translated' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(2);
    const firstStageConfig = llmMocks.runStage.mock.calls[0][2];
    const secondStageConfig = llmMocks.runStage.mock.calls[1][2];
    expect(firstStageConfig.blobContext).toBe(secondStageConfig.blobContext);
    expect(firstStageConfig.blobContext).toContain('<chunk id="chunk-0">');
    expect(firstStageConfig.blobContext).toContain('First');
    expect(firstStageConfig.blobContext).toContain('<chunk id="chunk-1">');
    expect(firstStageConfig.blobContext).toContain('Second');
    expect(firstStageConfig.blobCurrentChunkId).toBe('chunk-0');
    expect(secondStageConfig.blobCurrentChunkId).toBe('chunk-1');
  });

  it('keeps the coherence blob context stable and selects the current chunk separately', async () => {
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'chunk-0',
          originalText: 'First',
          sourceProcessingText: 'First',
          translationDisplayText: 'Prima',
          translationProcessingText: 'Prima',
          currentDraft: 'Prima',
          status: 'completed',
          blobId: 'blob-1',
          blobOrder: 0,
          blobReferenceChunkIds: ['chunk-0', 'chunk-1'],
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          originalText: 'Second',
          sourceProcessingText: 'Second',
          translationDisplayText: 'Seconda',
          translationProcessingText: 'Seconda',
          currentDraft: 'Seconda',
          status: 'completed',
          blobId: 'blob-1',
          blobOrder: 1,
          blobReferenceChunkIds: ['chunk-0', 'chunk-1'],
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runCoherenceAudit();
    });

    const coherenceCall = llmMocks.runCoherenceForChunk.mock.calls[0];
    expect(coherenceCall[0].blobContext).toContain('<chunk id="chunk-0">');
    expect(coherenceCall[0].blobContext).toContain('Prima');
    expect(coherenceCall[0].blobContext).toContain('<chunk id="chunk-1">');
    expect(coherenceCall[0].blobContext).toContain('Seconda');
    expect(coherenceCall[0].currentChunkId).toBe('chunk-0');
  });

  it('marks chunk as error and calls toast.error on non-cancellation stage failure', async () => {
    // Use a config-class error so withRetry gives up immediately (no delay).
    llmMocks.runStage.mockRejectedValueOnce(
      new Error('API key not configured. Set it in Settings.'),
    );

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-0');
    });

    expect(useChunksStore.getState().chunks[0].status).toBe('error');
    expect(toast.error).toHaveBeenCalled();
  });

  it('calls toast.success when all chunks complete without errors', async () => {
    llmMocks.runStage.mockResolvedValue({ content: 'translated' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'good',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(toast.success).toHaveBeenCalledWith('errors.pipelineCompleted');
    expect(useChunksStore.getState().chunks.every((c) => c.status === 'completed')).toBe(true);
  });

  it('runAuditOnly calls judge for each chunk with a translation draft', async () => {
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'chunk-0',
          originalText: 'First',
          currentDraft: 'Prima',
          translationDisplayText: 'Prima',
          translationProcessingText: 'Prima',
          status: 'completed',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          originalText: 'Second',
          currentDraft: 'Seconda',
          translationDisplayText: 'Seconda',
          translationProcessingText: 'Seconda',
          status: 'completed',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runAuditOnly();
    });

    expect(llmMocks.judgeTranslation).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('errors.reEvalCompleted');
  });

  it('runAuditOnly skips chunks that have no translation draft', async () => {
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'chunk-0',
          originalText: 'First',
          currentDraft: '',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runAuditOnly();
    });

    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
  });

  describe('runDryRun — test phase', () => {
    it('marks the first ready chunk as preview after a successful run', async () => {
      useUiStore.setState({ pipelineTestChunkCount: 1 });
      llmMocks.runStage.mockResolvedValue({ content: 'Test translation' });
      llmMocks.judgeTranslation.mockResolvedValue({ content: '', rating: 'good', issues: [] });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runDryRun();
      });

      const chunks = useChunksStore.getState().chunks;
      expect(chunks[0]!.status).toBe('preview');
      expect(chunks[1]!.status).toBe('ready');
    });

    it('skips chunks already in preview and targets the next ready chunk', async () => {
      useChunksStore.setState({
        chunks: [
          makeTranslationChunk({
            id: 'chunk-0',
            originalText: 'First',
            status: 'preview',
            currentDraft: 'Already tested',
            stageResults: { 'stg-1': { content: 'Already tested', status: 'completed' } },
            judgeResult: { content: '', status: 'completed', rating: 'good', issues: [] },
          }),
          makeTranslationChunk({
            id: 'chunk-1',
            originalText: 'Second',
            status: 'ready',
            stageResults: {},
            judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
            currentDraft: '',
          }),
        ],
        isProcessing: false,
        cancelRequested: false,
        activeStreamId: null,
      });

      llmMocks.runStage.mockResolvedValue({ content: 'Second test' });
      llmMocks.judgeTranslation.mockResolvedValue({ content: '', rating: 'good', issues: [] });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runDryRun();
      });

      const chunks = useChunksStore.getState().chunks;
      expect(chunks[0]!.status).toBe('preview');
      expect(chunks[1]!.status).toBe('preview');
      expect(llmMocks.runStage).toHaveBeenCalledTimes(1);
    });

    it('shows dryRunNoTarget toast when all chunks are already completed or preview', async () => {
      useChunksStore.setState({
        chunks: [
          makeTranslationChunk({
            id: 'chunk-0',
            originalText: 'First',
            status: 'completed',
            currentDraft: 'Done',
            stageResults: {},
            judgeResult: { content: '', status: 'completed', rating: 'good', issues: [] },
          }),
          makeTranslationChunk({
            id: 'chunk-1',
            originalText: 'Second',
            status: 'preview',
            currentDraft: 'Tested',
            stageResults: {},
            judgeResult: { content: '', status: 'completed', rating: 'good', issues: [] },
          }),
        ],
        isProcessing: false,
        cancelRequested: false,
        activeStreamId: null,
      });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runDryRun();
      });

      expect(llmMocks.runStage).not.toHaveBeenCalled();
      expect(toast.message).toHaveBeenCalledWith('pipeline.dryRunNoTarget');
    });
  });

  describe('runSingleChunk — finalStatus param', () => {
    it('marks the chunk as preview when finalStatus is preview', async () => {
      llmMocks.runStage.mockResolvedValue({ content: 'Preview result' });
      llmMocks.judgeTranslation.mockResolvedValue({ content: '', rating: 'good', issues: [] });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('chunk-0', 'preview');
      });

      expect(useChunksStore.getState().chunks[0]!.status).toBe('preview');
      expect(toast.success).toHaveBeenCalledWith('pipeline.dryRunChunkCompleted');
    });

    it('marks the chunk as completed when finalStatus is completed (default)', async () => {
      llmMocks.runStage.mockResolvedValue({ content: 'Final result' });
      llmMocks.judgeTranslation.mockResolvedValue({ content: '', rating: 'good', issues: [] });

      const { result } = renderHook(() => usePipeline());
      await act(async () => {
        await result.current.runSingleChunk('chunk-0');
      });

      expect(useChunksStore.getState().chunks[0]!.status).toBe('completed');
      expect(toast.success).toHaveBeenCalledWith('pipeline.singleChunkCompleted');
    });
  });
});
