import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailRail } from './ThumbnailRail';

const cachedImage = vi.hoisted(() => vi.fn());

vi.mock('../../services/cacheService', () => ({
  THUMB_SIZE: 'thumb',
  cachedImage,
}));

const pages = Array.from({ length: 30 }, (_, index) => ({
  index: index + 1,
  label: `Pagina ${index + 1}`,
  imageService: `https://images.example.test/${index + 1}`,
  width: 1000,
  height: 1400,
  canvasId: `canvas-${index + 1}`,
  thumbnail: null,
}));

describe('ThumbnailRail', () => {
  beforeEach(() => {
    cachedImage.mockReset();
    cachedImage.mockResolvedValue(new Uint8Array([1, 2, 3]));
    let next = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:miniatura-${(next += 1)}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('porta nel tratto visibile la pagina corrente', () => {
    const { rerender } = render(
      <ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={0} onSelect={vi.fn()} />,
    );
    const rail = screen.getByRole('listbox');
    Object.defineProperty(rail, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(rail, 'scrollTop', { configurable: true, writable: true, value: 0 });

    rerender(<ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={20} onSelect={vi.fn()} />);

    expect(rail.scrollTop).toBeGreaterThan(0);
  });

  it('usa le frecce per scegliere la pagina adiacente quando il rail ha il focus', () => {
    const onSelect = vi.fn();
    render(<ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={5} onSelect={onSelect} />);

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
    render(<ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={0} onSelect={vi.fn()} />);
    const rail = screen.getByRole('listbox');
    Object.defineProperty(rail, 'clientHeight', { configurable: true, value: 280 });
    Object.defineProperty(rail, 'scrollTop', { configurable: true, writable: true, value: 1200 });

    act(() => notifyResize?.());

    expect(rail.scrollTop).toBe(1200);
  });

  it('conserva una miniatura quando esce e rientra nel tratto visibile', async () => {
    const view = render(
      <ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={0} onSelect={vi.fn()} />,
    );
    await waitFor(() => expect(cachedImage).toHaveBeenCalled());
    await waitFor(() => expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:miniatura-1'));

    view.rerender(
      <ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={20} onSelect={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('Pagina 21')).toBeInTheDocument());
    view.rerender(
      <ThumbnailRail pages={pages} versionId="sver-1" providerKey={null} currentIndex={0} onSelect={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('Pagina 1')).toBeInTheDocument());

    const pageOneRequests = cachedImage.mock.calls.filter(([request]) => request.index === 1);
    expect(pageOneRequests).toHaveLength(1);
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:miniatura-1');
  });
});
