import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentView } from './DocumentView';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { makeTranslationChunk } from '../../test/chunkFactory';

const renderView = () => render(<DocumentView onRetranslateChunk={vi.fn()} onImportDocument={vi.fn()} />);

describe('DocumentView — chunk being translated', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedChunkId: 'c1' });
  });

  it('covers the translation text with the running veil while the chunk is translated', () => {
    useChunksStore.setState({
      chunks: [makeTranslationChunk({ id: 'c1', sourceDisplayText: 'Uno', status: 'processing' })],
      isProcessing: true,
    });
    renderView();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('document.chunkTranslating');
    expect(status).toHaveClass('text-editorial-running');
  });

  it('leaves the translation text free when the chunk is not being translated', () => {
    useChunksStore.setState({
      chunks: [makeTranslationChunk({ id: 'c1', sourceDisplayText: 'Uno', status: 'completed' })],
      isProcessing: false,
    });
    renderView();
    expect(screen.queryByText('document.chunkTranslating')).not.toBeInTheDocument();
  });
});
