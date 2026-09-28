import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCatalogSelection } from './useCatalogSelection';

const IDS = ['a', 'b', 'c', 'd'];

describe('useCatalogSelection', () => {
  it('Ctrl aggiunge e toglie una riga alla volta', () => {
    const { result } = renderHook(() => useCatalogSelection(IDS));
    act(() => result.current.pick('a', 'toggle'));
    act(() => result.current.pick('c', 'toggle'));
    expect([...result.current.selected]).toEqual(['a', 'c']);
    act(() => result.current.pick('a', 'toggle'));
    expect([...result.current.selected]).toEqual(['c']);
  });

  it('Maiuscolo sceglie tutto l\'intervallo dall\'ultima scelta, in qualunque verso', () => {
    const { result } = renderHook(() => useCatalogSelection(IDS));
    act(() => result.current.pick('d', 'toggle'));
    act(() => result.current.pick('b', 'range'));
    expect([...result.current.selected].sort()).toEqual(['b', 'c', 'd']);
  });

  it('svuota la scelta', () => {
    const { result } = renderHook(() => useCatalogSelection(IDS));
    act(() => result.current.pick('a', 'only'));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });
});
