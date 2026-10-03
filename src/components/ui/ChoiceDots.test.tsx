import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChoiceDots } from './ChoiceDots';

describe('ChoiceDots', () => {
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
