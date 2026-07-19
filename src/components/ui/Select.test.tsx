import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('Select', () => {
  it('renders all options and reflects the current value', () => {
    render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="Test" />);
    const select = screen.getByRole('combobox', { name: 'Test' }) as HTMLSelectElement;
    expect(select.value).toBe('b');
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
  });

  it('calls onChange with the selected value', async () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={OPTIONS} ariaLabel="Test" />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Test' }), 'b');

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('is disabled when disabled is true', () => {
    render(<Select value="a" onChange={vi.fn()} options={OPTIONS} ariaLabel="Test" disabled />);
    expect(screen.getByRole('combobox', { name: 'Test' })).toBeDisabled();
  });
});
