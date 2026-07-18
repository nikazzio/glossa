import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const;

describe('SegmentedControl', () => {
  it('only the active option is tabbable (roving tabindex)', () => {
    render(<SegmentedControl options={[...OPTIONS]} value="b" onChange={vi.fn()} ariaLabel="Test" />);

    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight moves selection to the next option and wraps at the end', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl options={[...OPTIONS]} value="c" onChange={onChange} ariaLabel="Test" />,
    );

    screen.getByRole('radio', { name: 'Gamma' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('a');
    rerender(<SegmentedControl options={[...OPTIONS]} value="a" onChange={onChange} ariaLabel="Test" />);
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
  });

  it('ArrowLeft moves selection to the previous option and wraps at the start', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={[...OPTIONS]} value="a" onChange={onChange} ariaLabel="Test" />);

    screen.getByRole('radio', { name: 'Alpha' }).focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('Home and End jump to the first and last option', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={[...OPTIONS]} value="b" onChange={onChange} ariaLabel="Test" />);

    screen.getByRole('radio', { name: 'Beta' }).focus();
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('a');

    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('clicking an option still calls onChange directly', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={[...OPTIONS]} value="a" onChange={onChange} ariaLabel="Test" />);

    await userEvent.click(screen.getByRole('radio', { name: 'Gamma' }));

    expect(onChange).toHaveBeenCalledWith('c');
  });
});
