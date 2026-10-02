import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModelSection } from './ModelSection';
import { useConfigStore } from '../../stores/configStore';

const renderSection = (props: Partial<Parameters<typeof ModelSection>[0]> = {}) =>
  render(
    <ModelSection
      provider="openai"
      model="gpt-4o"
      options={undefined}
      keyStatuses={{}}
      onProviderChange={vi.fn()}
      onModelChange={vi.fn()}
      onOptionsChange={vi.fn()}
      runtimeTitle="runtime"
      runtimeHint="hint"
      {...props}
    />,
  );

describe('ModelSection', () => {
  beforeEach(() => {
    useConfigStore.setState({ ollamaModels: [], ollamaStatus: 'unknown' });
  });

  it('keeps the model closed by the lock once translations exist, until unlocked', () => {
    renderSection({ locked: true });
    const provider = screen.getByRole('combobox', { name: 'models.provider' });
    expect(provider).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'pipeline.unlockModelChange' }));
    expect(provider).toBeEnabled();
    expect(screen.getByRole('button', { name: 'pipeline.lockModelChange' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no lock without translations', () => {
    renderSection();
    expect(screen.queryByRole('button', { name: 'pipeline.unlockModelChange' })).not.toBeInTheDocument();
  });

  it('offers to reload models when Ollama is unreachable', () => {
    useConfigStore.setState({ ollamaStatus: 'disconnected' });
    const onRefreshOllama = vi.fn();
    renderSection({ provider: 'ollama', model: 'llama3', onRefreshOllama });
    fireEvent.click(screen.getByRole('button', { name: 'pipeline.ollamaOfflineReload' }));
    expect(onRefreshOllama).toHaveBeenCalled();
  });
});
