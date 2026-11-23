import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { TranscriptionInspector, type TranscriptionInspectorTab } from './TranscriptionInspector';
import type { TranscriptionDocument } from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';

vi.mock('../../services/jobsService', () => ({
  OCR_JOB_TYPE: 'ocr_page',
  onJobChanged: vi.fn(async () => () => undefined),
}));
vi.mock('../../services/transcriptionSummaryService', () => ({
  getPageReadInfo: vi.fn(async () => ({ reads: 1, lastCostUsd: 0.05 })),
  getTranscriptionSummary: vi.fn(() => new Promise(() => undefined)),
}));

const document: TranscriptionDocument = {
  id: 'd1', source_version_id: 'v1', workspace_id: 'ws1', title: 'Libro', status: 'active',
  ocr_provider: null, ocr_model: null, ocr_prompt: null,
};
const workspace = { ocrDefaultProvider: 'openai' as const, ocrDefaultModel: 'gpt-5.6-terra', ocrDefaultPrompt: '' };
const viewerRef: ViewerVersionRef = {
  sourceId: 's1', versionId: 'v1', versionKind: 'iiif_manifest',
  sourceUrl: 'https://biblioteca.example/manifest.json', providerKey: 'gallica',
};

function Harness({ viewer = viewerRef }: { viewer?: ViewerVersionRef | null }) {
  const [tab, setTab] = useState<TranscriptionInspectorTab>('notes');
  return (
    <TranscriptionInspector
      activeTab={tab} onTabChange={setTab} collapsed={false} onCollapsedChange={vi.fn()}
      revisions={[]} segment={{ id: 'seg1', document_id: 'd1', position: 0, label: null, source_page_id: null, approved_revision_id: null }}
      draft="" formatDate={(value) => value} onRestore={vi.fn()} onDeleteRevision={vi.fn()}
      onNameRevision={vi.fn()} onClearHistory={vi.fn()} pagePending={false} pagePendingError={null}
      displayIndex={0} pageLabel={null} pageTotal={10} verified={false}
      document={document} workspace={workspace} viewerRef={viewer}
      ocrStarting={false} ocrReading={false} pageTitleShort="1" onStartOcr={vi.fn()}
      onDocumentOcrProviderChange={vi.fn()} onDocumentOcrModelChange={vi.fn()} onDocumentOcrPromptChange={vi.fn()}
      ocrImage={{ edge: 2000, mode: 'optimized' }} onOcrImageModeChange={vi.fn()}
      notesTab={<p>contenuto delle note</p>}
      promptDraft={null} onPromptDraftChange={vi.fn()}
    />
  );
}

beforeEach(() => {
  usePromptTemplateStore.setState({ templates: [], isLoaded: true, loadTemplates: vi.fn(async () => undefined) });
});

describe('colonna Strumenti dello Studio di trascrizione', () => {
  it('apre su Note, con le schede in ordine Note, Storico, OCR, Riepilogo', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') ?? tab.textContent);
    expect(tabs).toEqual([
      'transcription.tabs.notes', 'transcription.tabs.history', 'transcription.tabs.assist', 'transcription.tabs.summary',
    ]);
    expect(screen.getByText('contenuto delle note')).toBeInTheDocument();
  });

  it('il comando di lettura resta visibile cambiando scheda, con modello e costo dell ultima lettura', async () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'transcription.assist.readThisPage' })).toBeEnabled();
    expect(await screen.findByText('transcription.run.lastReadCost')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'transcription.tabs.history' }));
    expect(screen.getByRole('button', { name: 'transcription.assist.readThisPage' })).toBeEnabled();
    expect(screen.queryByText('contenuto delle note')).toBeNull();
  });

  it('servizio e modello sopra le schede aprono la scheda OCR, con la scelta del workspace', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /gpt-5\.6-terra/ }));
    expect(screen.getByRole('tab', { name: 'transcription.tabs.assist' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('transcription.assist.modelFromWorkspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'transcription.assist.customizeForDocument' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('senza immagine il comando è spento e il suggerimento ne dice il motivo', () => {
    render(<Harness viewer={null} />);
    expect(screen.getByRole('button', { name: 'transcription.assist.noDigitization' })).toBeDisabled();
  });
});
