import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChoiceDots } from './ChoiceDots';

describe('ChoiceDots', () => {
  it('lets Tab enter through the first enabled radio when the selected value is disabled', () => {
    render(<ChoiceDots ariaLabel="Mode" value="b" onChange={vi.fn()} options={[
      { value: 'a', label: 'A', content: 'A' },
      { value: 'b', label: 'B', content: 'B', disabled: true },
      { value: 'c', label: 'C', content: 'C' },
    ]} />);
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'C' })).toHaveAttribute('tabindex', '-1');
  });
  it('skips a disabled option with the arrow keys', () => {
    const onChange = vi.fn();
    render(
      <ChoiceDots
        ariaLabel="Mode"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A', content: 'A' },
          { value: 'b', label: 'B — unavailable', content: 'B', disabled: true },
          { value: 'c', label: 'C', content: 'C' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'B — unavailable' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('c');
  });
});
