import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useProjectStore } from '../stores/projectStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useChunksStore } from '../stores/chunksStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

function pressSaveInside(element: HTMLElement) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
}

describe('Ctrl/⌘+S', () => {
  const saveVersionNow = vi.fn().mockResolvedValue(undefined);
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    vi.clearAllMocks();
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    useChunksStore.setState({ isProcessing: false });
    useLibraryStore.setState({ dirtyIds: [] });
    useProjectStore.setState({ currentProjectId: 'proj-1', saveVersionNow });
  });

  afterEach(() => {
    textarea.remove();
    useProjectStore.setState({ currentProjectId: null });
  });

  it('saves the open translation even while typing on a page, without a success notice', () => {
    renderHook(() => useKeyboardShortcuts({ onRunPipeline: vi.fn(), onRunSingleChunk: vi.fn() }));

    pressSaveInside(textarea);

    expect(saveVersionNow).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('defers the translation save while the pipeline runs', () => {
    useChunksStore.setState({ isProcessing: true });
    renderHook(() => useKeyboardShortcuts({ onRunPipeline: vi.fn(), onRunSingleChunk: vi.fn() }));

    pressSaveInside(textarea);

    expect(saveVersionNow).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('header.projectSaveDeferred');
  });

  it('does nothing inside a field when no translation is open', () => {
    useProjectStore.setState({ currentProjectId: null });
    renderHook(() => useKeyboardShortcuts({ onRunPipeline: vi.fn(), onRunSingleChunk: vi.fn() }));

    pressSaveInside(textarea);

    expect(saveVersionNow).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
