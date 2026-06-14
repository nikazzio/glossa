import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from './useEdgeResize';

describe('ResizeHandle accessibility', () => {
  const baseProps = {
    onPointerDown: vi.fn(),
    dragging: false,
    label: 'Resize',
    width: 240,
    min: 180,
    max: 320,
  };

  it('exposes the current width through ARIA value attributes', () => {
    render(<ResizeHandle {...baseProps} onResize={vi.fn()} onReset={vi.fn()} />);

    const handle = screen.getByRole('separator', { name: 'Resize' });
    expect(handle).toHaveAttribute('aria-valuenow', '240');
    expect(handle).toHaveAttribute('aria-valuemin', '180');
    expect(handle).toHaveAttribute('aria-valuemax', '320');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('grows the width by one step on ArrowRight', () => {
    const onResize = vi.fn();
    render(<ResizeHandle {...baseProps} onResize={onResize} onReset={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize' }), { key: 'ArrowRight' });

    expect(onResize).toHaveBeenCalledWith(256);
  });

  it('shrinks the width by one step on ArrowLeft', () => {
    const onResize = vi.fn();
    render(<ResizeHandle {...baseProps} onResize={onResize} onReset={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize' }), { key: 'ArrowLeft' });

    expect(onResize).toHaveBeenCalledWith(224);
  });

  it('clamps the keyboard step to the max width', () => {
    const onResize = vi.fn();
    render(<ResizeHandle {...baseProps} width={318} onResize={onResize} onReset={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize' }), { key: 'ArrowRight' });

    expect(onResize).toHaveBeenCalledWith(320);
  });

  it('resets the width on double click', () => {
    const onReset = vi.fn();
    render(<ResizeHandle {...baseProps} onResize={vi.fn()} onReset={onReset} />);

    fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
