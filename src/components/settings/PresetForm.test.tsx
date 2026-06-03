import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PresetForm } from './PresetForm';
import type { PhraseMemoryPresetConfig } from '../../types';

const defaultConfig: PhraseMemoryPresetConfig = {
  splitter: 'regex',
  similarityThreshold: 0.75,
  maxResults: 10,
  minPhraseLength: 3,
};

describe('PresetForm', () => {
  it('renders with initial values', () => {
    render(
      <PresetForm
        initialName="My Preset"
        initialConfig={defaultConfig}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('My Preset')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /regex/i })).toBeChecked();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
  });

  it('calls onSubmit with updated values when form is submitted', () => {
    const onSubmit = vi.fn();
    render(
      <PresetForm
        initialName=""
        initialConfig={defaultConfig}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Nuovo preset' } });
    fireEvent.click(screen.getByRole('radio', { name: /llm/i }));
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      'Nuovo preset',
      expect.objectContaining({ splitter: 'llm' }),
    );
  });

  it('does not submit when name is empty', () => {
    const onSubmit = vi.fn();
    render(
      <PresetForm
        initialName=""
        initialConfig={defaultConfig}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/nome obbligatorio/i)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <PresetForm
        initialName="Test"
        initialConfig={defaultConfig}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('enforces similarityThreshold between 0.5 and 1.0', () => {
    render(
      <PresetForm
        initialName="Test"
        initialConfig={defaultConfig}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '0.5');
    expect(slider).toHaveAttribute('max', '1');
  });
});
