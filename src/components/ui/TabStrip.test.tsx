import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabStrip } from './TabStrip';

const TABS = [
  { id: 'a', label: 'A', icon: <span /> },
  { id: 'b', label: 'B — spenta', icon: <span />, disabled: true },
  { id: 'c', label: 'C', icon: <span /> },
];

describe('TabStrip', () => {
  it('keeps a disabled tab visible but skips it with the arrow keys', () => {
    const onChange = vi.fn();
    render(<TabStrip tabs={TABS} activeId="a" onChange={onChange} ariaLabel="Viste" idPrefix="t" />);

    expect(screen.getByRole('tab', { name: 'B — spenta' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('lands on the first and last enabled tab with Home and End', () => {
    const onChange = vi.fn();
    render(<TabStrip tabs={TABS} activeId="c" onChange={onChange} ariaLabel="Viste" idPrefix="t" />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });
});
