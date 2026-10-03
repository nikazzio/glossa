import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChunksStore } from '../../../stores/chunksStore';
import { useConfigStore } from '../../../stores/configStore';
import { makeTranslationChunk } from '../../../test/chunkFactory';
import { PipelineSidebarRunSection } from './PipelineSidebarRunSection';

describe('PipelineSidebarRunSection', () => {
  beforeEach(() => {
    useChunksStore.setState({
      chunks: [makeTranslationChunk({ id: 'c1' }), makeTranslationChunk({ id: 'c2' }), makeTranslationChunk({ id: 'c3' })],
      isProcessing: false,
      cancelRequested: false,
    });
    useConfigStore.setState({ workMode: 'chunk', repeatChunkCount: null });
  });

  it('keeps the chunk counter in view but off while translating one chunk at a time', () => {
    render(<PipelineSidebarRunSection />);

    expect(screen.getByRole('switch', { name: 'pipeline.repeatModeLabel' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('pipeline.repeatChunkCountLabel')).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'pipeline.repeatChunkCountDecrease' })).toBeDisabled();
  });

  it('turns the counter on with the multiple-chunks switch', () => {
    render(<PipelineSidebarRunSection />);

    fireEvent.click(screen.getByRole('switch', { name: 'pipeline.repeatModeLabel' }));

    expect(useConfigStore.getState().workMode).toBe('all');
    expect(screen.getByRole('button', { name: 'pipeline.repeatChunkCountDecrease' })).not.toBeDisabled();
  });
});
