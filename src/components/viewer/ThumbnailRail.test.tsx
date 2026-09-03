import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailRail } from './ThumbnailRail';

vi.mock('../../hooks/useCachedImage', () => ({
  useCachedImage: () => ({ url: null, loading: false }),
}));

const pages = Array.from({ length: 30 }, (_, index) => ({
  index: index + 1,
  label: `Pagina ${index + 1}`,
  imageService: `https://images.example.test/${index + 1}`,
  width: 1000,
  height: 1400,
  canvasId: `canvas-${index + 1}`,
}));

describe('ThumbnailRail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('porta nel tratto visibile la pagina corrente', () => {
    const { rerender } = render(
      <ThumbnailRail pages={pages} providerKey={null} currentIndex={0} onSelect={vi.fn()} />,
    );
    const rail = screen.getByRole('listbox');
    Object.defineProperty(rail, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(rail, 'scrollTop', { configurable: true, writable: true, value: 0 });

    rerender(<ThumbnailRail pages={pages} providerKey={null} currentIndex={20} onSelect={vi.fn()} />);

    expect(rail.scrollTop).toBeGreaterThan(0);
  });

  it('usa le frecce per scegliere la pagina adiacente quando il rail ha il focus', () => {
    const onSelect = vi.fn();
    render(<ThumbnailRail pages={pages} providerKey={null} currentIndex={5} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });

    expect(onSelect).toHaveBeenCalledWith(6);
  });

  it('non riporta in cima lo scorrimento quando cambia l altezza del rail', () => {
    let notifyResize: (() => void) | null = null;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe(): void {}
      disconnect(): void {}
    });
    render(<ThumbnailRail pages={pages} providerKey={null} currentIndex={0} onSelect={vi.fn()} />);
    const rail = screen.getByRole('listbox');
    Object.defineProperty(rail, 'clientHeight', { configurable: true, value: 280 });
    Object.defineProperty(rail, 'scrollTop', { configurable: true, writable: true, value: 1200 });

    act(() => notifyResize?.());

    expect(rail.scrollTop).toBe(1200);
  });
});
