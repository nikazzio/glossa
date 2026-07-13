import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectAutosave, buildProjectSnapshot } from './useProjectAutosave';
import { useProjectStore } from '../stores/projectStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { useUiStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';
import { makeTranslationChunk } from '../test/chunkFactory';

describe('useProjectAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    useProjectStore.setState({
      projects: [],
      currentProjectId: 'proj-1',
      showProjectPanel: false,
      saveState: 'idle',
      lastSaveError: null,
      trackedSnapshot: null,
    });

    usePipelineStore.setState((state) => ({
      ...state,
      inputText: 'Original text',
      inputProcessingText: 'Original text',
      sourceFootnotes: [],
      config: {
        ...state.config,
        useChunking: false,
        wordsPerChunk: 0,
      },
    }));

    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'chunk-0',
          sourceDisplayText: 'Original text',
          status: 'ready',
          stageResults: {},
          judgeResult: {
            content: '',
            status: 'idle',
            rating: 'fair',
            issues: [],
          },
          translationDisplayText: '',
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    useUiStore.setState({
      viewMode: 'document',
      documentLayout: 'auto',
      selectedChunkId: 'chunk-0',
      showSettings: false,
      showHelp: false,
    });
    useConfigStore.setState({
      ollamaModels: [],
      ollamaStatus: 'unknown',
    });
  });

  it('marks a project dirty on edits and autosaves it after the debounce', async () => {
    const saveCurrentProject = vi
      .spyOn(useProjectStore.getState(), 'saveCurrentProject')
      .mockResolvedValue();

    renderHook(() => useProjectAutosave(500));

    expect(useProjectStore.getState().saveState).toBe('saved');

    act(() => {
      useChunksStore.getState().updateChunkDraft('chunk-0', 'Translated text');
    });

    expect(useProjectStore.getState().saveState).toBe('dirty');

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('snapshot uses inputText verbatim and does not reconstruct it by joining chunks (regression)', () => {
    // Triple newlines would be collapsed to double if reconstructed from chunks via join('\n\n')
    const documentText = 'Paragraph one.\n\n\n\nParagraph two.';

    usePipelineStore.setState((state) => ({
      ...state,
      inputText: documentText,
      inputProcessingText: documentText,
      sourceFootnotes: [],
    }));

    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({ id: 'a', sourceDisplayText: 'Paragraph one.' }),
        makeTranslationChunk({ id: 'b', sourceDisplayText: 'Paragraph two.' }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    const snapshot = buildProjectSnapshot({
      inputText: documentText,
      inputProcessingText: documentText,
      sourceFootnotes: [],
      config: usePipelineStore.getState().config,
      chunks: useChunksStore.getState().chunks,
      viewMode: 'document',
    });

    const parsed = JSON.parse(snapshot);
    expect(parsed.inputText).toBe(documentText);
    // Prove the triple newline is preserved, not collapsed to double
    expect(parsed.inputText).toContain('\n\n\n\n');
  });

  it('snapshot includes sourceFootnotes and inputProcessingText', () => {
    usePipelineStore.setState((state) => ({
      ...state,
      inputText: 'Body [^1].\n\n[^1]: A note.',
      inputProcessingText: 'Body [^1].',
      sourceFootnotes: [{ id: '1', text: 'A note.' }],
    }));

    const snapshot = buildProjectSnapshot({
      inputText: 'Body [^1].\n\n[^1]: A note.',
      inputProcessingText: 'Body [^1].',
      sourceFootnotes: [{ id: '1', text: 'A note.' }],
      config: usePipelineStore.getState().config,
      chunks: [],
      viewMode: 'document',
    });

    const parsed = JSON.parse(snapshot);
    expect(parsed.inputProcessingText).toBe('Body [^1].');
    expect(parsed.sourceFootnotes).toEqual([{ id: '1', text: 'A note.' }]);
  });
});
