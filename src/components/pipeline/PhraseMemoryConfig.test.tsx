import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PhraseMemoryConfig } from './PhraseMemoryConfig';

const renderConfig = (overrides: Partial<ComponentProps<typeof PhraseMemoryConfig>> = {}) => {
  const onChange = vi.fn();
  render(
    <PhraseMemoryConfig
      usePhraseMemory={false}
      autoSearchPhraseMemory={true}
      phraseMemoryMaxResults={10}
      onChange={onChange}
      {...overrides}
    />,
  );
  return onChange;
};

describe('PhraseMemoryConfig', () => {
  it('shows disabled memory switch by default', () => {
    renderConfig();
    const toggle = screen.getByRole('switch', { name: /memory/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('enabling memory emits pipeline memory defaults', () => {
    const onChange = renderConfig();
    fireEvent.click(screen.getByRole('switch', { name: /memory/i }));

    expect(onChange).toHaveBeenCalledWith({
      usePhraseMemory: true,
      autoSearchPhraseMemory: true,
      phraseMemoryMaxResults: 10,
    });
  });

  it('shows auto-search and max results when memory is enabled', () => {
    renderConfig({ usePhraseMemory: true });

    expect(screen.getByRole('switch', { name: /auto-search/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/max results/i)).toBeInTheDocument();
  });

  it('toggling auto-search emits false while preserving search limits', () => {
    const onChange = renderConfig({ usePhraseMemory: true });
    fireEvent.click(screen.getByRole('switch', { name: /auto-search/i }));

    expect(onChange).toHaveBeenCalledWith({
      usePhraseMemory: true,
      autoSearchPhraseMemory: false,
      phraseMemoryMaxResults: 10,
    });
  });

  it('updates max results', () => {
    const onChange = renderConfig({ usePhraseMemory: true });

    fireEvent.change(screen.getByLabelText(/max results/i), {
      target: { value: '7' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      phraseMemoryMaxResults: 7,
    }));
  });
});
