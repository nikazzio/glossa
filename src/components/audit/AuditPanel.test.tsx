import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { AuditPanel } from './AuditPanel';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';

describe('AuditPanel', () => {
  beforeEach(() => {
    useChunksStore.setState({
      chunks: [],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    useUiStore.setState({
      viewMode: 'document',
      documentLayout: 'auto',
      selectedChunkId: null,
      showSettings: false,
      showHelp: false,
      showConfigDrawer: false,
      showDocumentDrawer: true,
      documentDrawerTab: 'index',
      showChunkDrawer: false,
      chunkDrawerTab: 'audit',
      ollamaModels: [],
      ollamaStatus: 'unknown',
      glossaryHighlightEnabled: false,
      focusedChunkId: null,
      focusedIssueQuery: null,
      focusedIssueRequestId: 0,
      chunkPresetShort: 400,
      chunkPresetMedium: 700,
      chunkPresetLong: 1000,
      ollamaBaseUrl: 'http://localhost:11434',
    });
  });

  it('shows the locate button only when an audit issue includes a phrase', () => {
    useChunksStore.setState({
      chunks: [
        {
          id: 'chunk-1',
          sourceDisplayText: 'Source',
          sourceProcessingText: 'Source',
          translationDisplayText: 'Draft',
          translationProcessingText: 'Draft',
          originalText: 'Source',
          status: 'completed',
          currentDraft: 'Draft',
          translationLocked: false,
          translationStale: false,
          sourceEditable: false,
          stageResults: {},
          judgeResult: {
            content: '',
            status: 'completed',
            rating: 'good',
            issues: [
              {
                type: 'accuracy',
                severity: 'medium',
                description: 'Has phrase',
                phrase: 'Draft',
              },
              {
                type: 'fluency',
                severity: 'low',
                description: 'No phrase',
              },
            ],
          },
        },
      ],
    });

    render(<AuditPanel onRunAuditOnly={() => {}} onReauditChunk={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /pipeline\.unit 01/i }));

    expect(screen.getByText('Has phrase')).toBeInTheDocument();
    expect(screen.getByText('No phrase')).toBeInTheDocument();
    expect(screen.getAllByText('audit.locateInText')).toHaveLength(1);
  });
});
