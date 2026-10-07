import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTranslationChunk } from '../../test/chunkFactory';
import { ChunkStrip } from './ChunkStrip';

const CHUNKS = Array.from({ length: 20 }, (_, index) => makeTranslationChunk({ id: `c${index + 1}` }));

describe('ChunkStrip', () => {
  it('moves to the previous and next chunk from the single arrows', () => {
    const onSelect = vi.fn();
    const { container } = render(<ChunkStrip chunks={CHUNKS} currentIndex={1} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'document.nextChunk' }));
    fireEvent.click(screen.getByRole('button', { name: 'document.previousChunk' }));

    expect(onSelect.mock.calls).toEqual([['c3'], ['c1']]);
    expect(container.textContent).toContain('02/ 20');
  });

  it('jumps a whole window with the double arrows, stopping at the ends', () => {
    const onSelect = vi.fn();
    render(<ChunkStrip chunks={CHUNKS} currentIndex={3} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'document.jumpForwardChunks' }));
    fireEvent.click(screen.getByRole('button', { name: 'document.jumpBackChunks' }));

    expect(onSelect.mock.calls).toEqual([['c11'], ['c1']]);
  });

  it('turns the backward arrows off on the first chunk', () => {
    render(<ChunkStrip chunks={CHUNKS} currentIndex={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'document.previousChunk' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'document.jumpBackChunks' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'document.nextChunk' })).not.toBeDisabled();
  });

  it('offers only the seven dots of the window, the open chunk in the middle', () => {
    render(<ChunkStrip chunks={CHUNKS} currentIndex={10} onSelect={vi.fn()} />);

    const dots = screen.getAllByRole('button', { name: /document\.chunkLabel/ });
    expect(dots).toHaveLength(7);
    expect(dots[3]).toHaveAttribute('aria-current', 'true');
    expect(dots[3]).toHaveAccessibleName(/11\/20/);
  });

  it('scrolls to the next chunk with the mouse wheel over the dots', () => {
    const onSelect = vi.fn();
    render(<ChunkStrip chunks={CHUNKS} currentIndex={5} onSelect={onSelect} />);

    const dot = screen.getAllByRole('button', { name: /document\.chunkLabel/ })[0];
    fireEvent.wheel(dot, { deltaY: 100 });

    expect(onSelect).toHaveBeenCalledWith('c7');
  });
});
