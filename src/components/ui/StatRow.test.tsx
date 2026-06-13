import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatRow } from './StatRow';

describe('StatRow', () => {
  it('renders the label and value as a definition pair', () => {
    render(
      <dl>
        <StatRow label="Source words" value="16,600" />
      </dl>,
    );

    expect(screen.getByText('Source words')).toBeInTheDocument();
    expect(screen.getByText('16,600')).toBeInTheDocument();
  });

  it('renders content smaller than the section title and right-aligns the value', () => {
    const { container } = render(
      <dl>
        <StatRow label="Token" value="135,434" />
      </dl>,
    );

    const label = screen.getByText('Token');
    expect(label.className).toContain('text-[11px]');
    expect(label.className).toContain('tracking-[0.1em]');

    // Serif value larger than the sans caption — serif italic needs more size to read.
    const value = screen.getByText('135,434');
    expect(value.className).toContain('text-sm');

    // Two-column layout: label left, value pushed right.
    expect(container.querySelector('.justify-between')).not.toBeNull();
  });
});
