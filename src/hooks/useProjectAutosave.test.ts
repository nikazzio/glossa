import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectAutosave } from './useProjectAutosave';
import { useProjectStore } from '../stores/projectStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { useUiStore } from '../stores/uiStore';

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
      config: {
        ...state.config,
        useChunking: false,
        targetChunkCount: 0,
      },
    }));

    useChunksStore.setState({
      chunks: [
        {
          id: 'chunk-0',
          originalText: 'Original text',
          status: 'ready',
          stageResults: {},
          judgeResult: {
            content: '',
            status: 'idle',
            rating: 'fair',
            issues: [],
          },
          currentDraft: '',
        },
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
});
