import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePhraseMemoryMatches } from './usePhraseMemoryMatches';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

const makeMatch = (id: string): PhraseMemoryMatch => ({
  id,
  sourcePhrase: `source ${id}`,
  targetPhrase: `target ${id}`,
  score: 0.9,
  confidence: 0.8,
  createdAt: new Date().toISOString(),
});

vi.mock('../stores/phraseMemoryStore', () => ({
  usePhraseMemoryStore: vi.fn(),
}));

describe('usePhraseMemoryMatches', () => {
  beforeEach(() => {
    vi.mocked(usePhraseMemoryStore).mockReturnValue({
      matchesByChunk: new Map([
        ['chunk-1', {
          chunkId: 'chunk-1',
          matches: [makeMatch('m1'), makeMatch('m2')],
          enabledMatchIds: new Set(['m1', 'm2']),
        }],
      ]),
      toggleMatchEnabled: vi.fn(),
      setEnabledMatchIds: vi.fn(),
    } as unknown as ReturnType<typeof usePhraseMemoryStore>);
  });

  it('returns matches for the given chunkId', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'));
    expect(result.current.matches).toHaveLength(2);
  });

  it('returns empty array for unknown chunkId', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('unknown'));
    expect(result.current.matches).toHaveLength(0);
  });

  it('returns enabledMatchIds for the given chunkId', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'));
    expect(result.current.enabledMatchIds.has('m1')).toBe(true);
  });

  it('toggleEnabled calls store toggleMatchEnabled', () => {
    const mockToggle = vi.fn();
    vi.mocked(usePhraseMemoryStore).mockReturnValue({
      matchesByChunk: new Map([
        ['chunk-1', { chunkId: 'chunk-1', matches: [makeMatch('m1')], enabledMatchIds: new Set(['m1']) }],
      ]),
      toggleMatchEnabled: mockToggle,
      setEnabledMatchIds: vi.fn(),
    } as unknown as ReturnType<typeof usePhraseMemoryStore>);

    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'));
    act(() => result.current.toggleEnabled('m1'));
    expect(mockToggle).toHaveBeenCalledWith('chunk-1', 'm1');
  });

  it('selectedMatches returns only enabled matches', () => {
    vi.mocked(usePhraseMemoryStore).mockReturnValue({
      matchesByChunk: new Map([
        ['chunk-1', {
          chunkId: 'chunk-1',
          matches: [makeMatch('m1'), makeMatch('m2')],
          enabledMatchIds: new Set(['m1']),
        }],
      ]),
      toggleMatchEnabled: vi.fn(),
      setEnabledMatchIds: vi.fn(),
    } as unknown as ReturnType<typeof usePhraseMemoryStore>);

    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'));
    expect(result.current.selectedMatches).toHaveLength(1);
    expect(result.current.selectedMatches[0].id).toBe('m1');
  });

  it('hasMatches is true when matches exist', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'));
    expect(result.current.hasMatches).toBe(true);
  });

  it('hasMatches is false when no matches', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('unknown'));
    expect(result.current.hasMatches).toBe(false);
  });
});
