import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { useConfigStore } from '../stores/configStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
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
    usePhraseMemoryStore.getState().reset();

    useConfigStore.setState({ repeatChunkCount: null });
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
          sourceDisplayText: 'First',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
          translationDisplayText: '',
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          sourceDisplayText: 'Second',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
          translationDisplayText: '',
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
              translationDisplayText: 'Already translated',
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
    expect(useChunksStore.getState().chunks[0].translationDisplayText).toBe('Already translated');
    expect(useChunksStore.getState().chunks[1].translationDisplayText).toBe('Second translated');
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
          sourceDisplayText: 'First',
          status: 'completed',
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
          sourceDisplayText: 'Second',
          status: 'completed',
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
    expect(useChunksStore.getState().chunks[0].translationDisplayText).toBe('Keep me');
    expect(useChunksStore.getState().chunks[1].translationDisplayText).toBe('Second retranslated');
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
    expect(useChunksStore.getState().chunks[0].translationDisplayText).toBe('');
    expect(useChunksStore.getState().chunks[1].translationDisplayText).toBe(
      'Translated only chunk-1',
    );
  });

  it('does not inject selected memory matches when Phrase Memory is disabled', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, usePhraseMemory: false },
    }));
    usePhraseMemoryStore.getState().setMatches('chunk-1', [
      {
        phraseMemoryId: 'pm-1',
        sourcePhrase: 'stored source',
        targetPhrase: 'stored target',
        distance: 0.1,
        confidence: 0.9,
      },
    ]);
    usePhraseMemoryStore.getState().setEnabledMatchIds('chunk-1', new Set(['pm-1']));
    llmMocks.runStage.mockResolvedValue({ content: 'Translated without memory' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-1');
    });

    const stage = llmMocks.runStage.mock.calls[0][1];
    expect(stage.prompt).not.toContain('stored source');
    expect(stage.prompt).not.toContain('stored target');
  });

  it('injects only explicitly selected memory matches when Phrase Memory is enabled', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, usePhraseMemory: true },
    }));
    usePhraseMemoryStore.getState().setMatches('chunk-1', [
      {
        phraseMemoryId: 'pm-1',
        sourcePhrase: 'stored source',
        targetPhrase: 'stored target',
        distance: 0.1,
        confidence: 0.9,
      },
    ]);
    usePhraseMemoryStore.getState().setEnabledMatchIds('chunk-1', new Set(['pm-1']));
    llmMocks.runStage.mockResolvedValue({ content: 'Translated with memory' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runSingleChunk('chunk-1');
    });

    const stage = llmMocks.runStage.mock.calls[0][1];
    expect(stage.prompt).toContain('stored source');
    expect(stage.prompt).toContain('stored target');
  });

  it('rerunChunkWithMemory injects memory without mutating the persisted stage prompt', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, usePhraseMemory: true },
    }));
    llmMocks.runStage.mockResolvedValue({ content: 'Translated with rerun memory' });
    llmMocks.judgeTranslation.mockResolvedValue({
      content: '',
      rating: 'excellent',
      issues: [],
    });

    const originalPrompt = usePipelineStore.getState().config.stages[0]!.prompt;
    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.rerunChunkWithMemory('chunk-1', [
        {
          id: 'pm-1',
          sourcePhrase: 'stored source',
          targetPhrase: 'stored target',
          score: 0.9,
          confidence: 0.9,
          createdAt: '2026-06-13T00:00:00.000Z',
        },
      ]);
    });

    expect(llmMocks.runStage.mock.calls[0][1].prompt).toContain('stored source');
    expect(usePipelineStore.getState().config.stages[0]!.prompt).toBe(originalPrompt);
  });

  it('re-audits only the targeted chunk', async () => {
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk, index) => ({
        ...chunk,
        translationDisplayText: `draft-${index}`,
        translationProcessingText: `draft-${index}`,
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

  it('does not start the next stage or audit after cancellation between stages', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [
          { id: 'stg-1', name: 'Stage 1', prompt: 'Translate', model: 'gemini-3-flash-preview', provider: 'gemini', enabled: true },
          { id: 'stg-2', name: 'Stage 2', prompt: 'Refine', model: 'gemini-3-flash-preview', provider: 'gemini', enabled: true },
        ],
      },
    }));
    llmMocks.runStage.mockImplementationOnce(async () => {
      useChunksStore.getState().requestCancel();
      return { content: 'First output' };
    });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStage).toHaveBeenCalledTimes(1);
    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    expect(useChunksStore.getState().chunks[0].status).toBe('ready');
  });

  it('marks an empty translation stage as an error instead of silently skipping it', async () => {
    llmMocks.runStage.mockResolvedValue({ content: ' \n ' });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.judgeTranslation).not.toHaveBeenCalled();
    expect(useChunksStore.getState().chunks[0].status).toBe('error');
    expect(useChunksStore.getState().chunks[0].stageResults['stg-1']?.status).toBe('error');
  });

  it('keeps chunks ready when the pipeline has no enabled stages', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: state.config.stages.map((stage) => ({ ...stage, enabled: false })),
      },
    }));

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(llmMocks.runStage).not.toHaveBeenCalled();
    expect(useChunksStore.getState().chunks.every((chunk) => chunk.status === 'ready')).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps a format-only pipeline ready when there is no prior output', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        stages: [{
          ...state.config.stages[0]!,
          role: 'format',
          enabled: true,
        }],
      },
    }));
    llmMocks.runStage.mockResolvedValue({ content: '' });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    expect(useChunksStore.getState().chunks.every((chunk) => chunk.status === 'ready')).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
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
    expect(useChunksStore.getState().chunks[0].translationDisplayText).toBe('Stage 2 output');
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
    expect(useChunksStore.getState().chunks[0].translationDisplayText).toBe('Formatted output');
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
    expect(chunk.translationDisplayText).toBe('Refined output');
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
          sourceDisplayText: 'First',
          sourceProcessingText: 'First',
          translationDisplayText: 'Prima',
          translationProcessingText: 'Prima',
          status: 'completed',
          blobId: 'blob-1',
          blobOrder: 0,
          blobReferenceChunkIds: ['chunk-0', 'chunk-1'],
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          sourceDisplayText: 'Second',
          sourceProcessingText: 'Second',
          translationDisplayText: 'Seconda',
          translationProcessingText: 'Seconda',
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

  it('source blob assembler excludes reference chunks with empty sourceProcessingText', async () => {
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'chunk-0',
          sourceDisplayText: 'First',
          sourceProcessingText: 'First',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
          translationDisplayText: '',
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          sourceDisplayText: 'Second',
          sourceProcessingText: '',
          status: 'ready',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
          translationDisplayText: '',
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });
    llmMocks.computeBlobs.mockResolvedValueOnce([
      { chunkId: 'chunk-0', blobId: 'blob-1', position: 0, referenceChunkIds: ['chunk-0', 'chunk-1'] },
      { chunkId: 'chunk-1', blobId: 'blob-1', position: 1, referenceChunkIds: ['chunk-0', 'chunk-1'] },
    ]);
    llmMocks.runStage.mockResolvedValue({ content: 'Translated' });
    llmMocks.judgeTranslation.mockResolvedValue({ content: '', rating: 'good', issues: [] });

    const { result } = renderHook(() => usePipeline());
    await act(async () => {
      await result.current.runPipeline();
    });

    const firstStageConfig = llmMocks.runStage.mock.calls[0][2];
    expect(firstStageConfig.blobContext).toContain('<chunk id="chunk-0">');
    expect(firstStageConfig.blobContext).not.toContain('<chunk id="chunk-1">');
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
          sourceDisplayText: 'First',
          translationDisplayText: 'Prima',
          translationProcessingText: 'Prima',
          status: 'completed',
          stageResults: {},
          judgeResult: { content: '', status: 'idle', rating: 'fair', issues: [] },
        }),
        makeTranslationChunk({
          id: 'chunk-1',
          sourceDisplayText: 'Second',
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
          sourceDisplayText: 'First',
          translationDisplayText: '',
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

  describe('runSingleChunk', () => {
    it('marks the chunk as completed after a successful run', async () => {
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
