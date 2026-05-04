import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../stores/chunksStore';
import { useChunkWatchdog } from './useChunkWatchdog';

const llmMocks = vi.hoisted(() => ({
  cancelStream: vi.fn(),
}));

vi.mock('../services/llmService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/llmService')>(
      '../services/llmService',
    );
  return { ...actual, llmService: llmMocks };
});

type PartialChunksState = Parameters<typeof useChunksStore.setState>[0];

const setChunksState = (partial: object) =>
  useChunksStore.setState(partial as unknown as PartialChunksState);

const baseChunk = {
  originalText: 'Hello',
  currentDraft: 'Ciao',
  stageResults: {},
  judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] },
};

beforeEach(() => {
  vi.useFakeTimers();
  llmMocks.cancelStream.mockResolvedValue(undefined);
  setChunksState({ chunks: [], activeStreamId: null, cancelRequested: false, isProcessing: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useChunkWatchdog', () => {
  it('starts with no stuck chunks', () => {
    const { result } = renderHook(() => useChunkWatchdog());
    expect(result.current.stuckChunkIds.size).toBe(0);
  });

  it('does not flag processing chunks before 60 s', async () => {
    setChunksState({
      chunks: [{ id: 'c1', status: 'processing', ...baseChunk }],
      activeStreamId: 'stream-1',
    });

    const { result } = renderHook(() => useChunkWatchdog());

    await act(async () => {
      vi.advanceTimersByTime(55_000);
    });

    expect(result.current.stuckChunkIds.has('c1')).toBe(false);
  });

  it('flags processing chunks after 60 s when actively streaming', async () => {
    setChunksState({
      chunks: [{ id: 'c1', status: 'processing', ...baseChunk }],
      activeStreamId: 'stream-1',
    });

    const { result } = renderHook(() => useChunkWatchdog());

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });

    expect(result.current.stuckChunkIds.has('c1')).toBe(true);
  });

  it('does not flag chunks when no active stream', async () => {
    setChunksState({
      chunks: [{ id: 'c1', status: 'processing', ...baseChunk }],
      activeStreamId: null,
    });

    const { result } = renderHook(() => useChunkWatchdog());

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });

    expect(result.current.stuckChunkIds.has('c1')).toBe(false);
  });

  it('cancelStuckChunk cancels active stream and resets chunk status', async () => {
    setChunksState({
      chunks: [{ id: 'c1', status: 'processing', ...baseChunk }],
      activeStreamId: 'stream-1',
    });

    const { result } = renderHook(() => useChunkWatchdog());

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });

    expect(result.current.stuckChunkIds.has('c1')).toBe(true);

    await act(async () => {
      result.current.cancelStuckChunk('c1');
    });

    expect(llmMocks.cancelStream).toHaveBeenCalledWith('stream-1');
    const { chunks } = useChunksStore.getState();
    expect(chunks.find((c) => c.id === 'c1')?.status).toBe('ready');
    expect(result.current.stuckChunkIds.has('c1')).toBe(false);
  });

  it('cancelStuckChunk does NOT call requestCancel on the store', async () => {
    const requestCancel = vi.spyOn(useChunksStore.getState(), 'requestCancel');

    setChunksState({
      chunks: [{ id: 'c1', status: 'processing', ...baseChunk }],
      activeStreamId: 'stream-1',
    });

    const { result } = renderHook(() => useChunkWatchdog());

    await act(async () => {
      vi.advanceTimersByTime(65_000);
      result.current.cancelStuckChunk('c1');
    });

    expect(requestCancel).not.toHaveBeenCalled();
  });
});
