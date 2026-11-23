import { BarChart2, History, MessageSquare, ScanText, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InspectorShell } from '../ui';
import type {
  TranscriptionDocument,
  TranscriptionRevision,
  TranscriptionSegment,
} from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { ModelProvider, Workspace } from '../../types';
import { TranscriptionAssistTab } from './TranscriptionAssistTab';
import { OcrStartButton } from './OcrStartButton';
import { OcrRunBlock } from './OcrRunBlock';
import type { OcrImageMode, OcrImagePreferences } from '../../services/ocrImageSettingsService';
import { TranscriptionSummaryTab } from './TranscriptionSummaryTab';
import { TranscriptionHistoryTab } from './TranscriptionHistoryTab';

export type TranscriptionInspectorTab = 'notes' | 'history' | 'assist' | 'summary';

interface TranscriptionInspectorProps {
  activeTab: TranscriptionInspectorTab;
  onTabChange: (tab: TranscriptionInspectorTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  revisions: TranscriptionRevision[];
  segment: TranscriptionSegment | null;
  draft: string;
  formatDate: (value: string) => string;
  onRestore: (revisionId: string) => void;
  onDeleteRevision: (revisionId: string) => void;
  onNameRevision: (revisionId: string, name: string | null) => void;
  onClearHistory: () => void;
  pagePending: boolean;
  pagePendingError: string | null;
  displayIndex: number;
  pageLabel: string | null;
  pageTotal: number | null;
  verified: boolean;
  document: TranscriptionDocument | null;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'> | null;
  viewerRef: ViewerVersionRef | null;
  ocrStarting: boolean;
  /** La pagina aperta è dentro un lavoro di lettura in corso. */
  ocrReading: boolean;
  /** Etichetta breve della pagina aperta, per i testi della scheda OCR. */
  pageTitleShort: string;
  onStartOcr: () => void;
  onDocumentOcrProviderChange: (provider: ModelProvider | '', model: string) => void;
  onDocumentOcrModelChange: (model: string) => void;
  onDocumentOcrPromptChange: (prompt: string | null) => void;
  ocrImage: OcrImagePreferences;
  onOcrImageModeChange: (mode: OcrImageMode) => void;
  /** Il contenuto della scheda Note, montato dallo Studio che ne tiene lo stato. */
  notesTab: ReactNode;
  promptDraft: string | null;
  onPromptDraftChange: (draft: string | null) => void;
}

export function TranscriptionInspector({
  activeTab,
  onTabChange,
  collapsed,
  onCollapsedChange,
  revisions,
  segment,
  draft,
  formatDate,
  onRestore,
  onDeleteRevision,
  onNameRevision,
  onClearHistory,
  pagePending,
  pagePendingError,
  displayIndex,
  pageLabel,
  pageTotal,
  verified,
  document,
  workspace,
  viewerRef,
  ocrStarting,
  ocrReading,
  pageTitleShort,
  onStartOcr,
  onDocumentOcrProviderChange,
  onDocumentOcrModelChange,
  onDocumentOcrPromptChange,
  ocrImage,
  onOcrImageModeChange,
  notesTab,
  promptDraft,
  onPromptDraftChange,
}: TranscriptionInspectorProps) {
  const { t } = useTranslation();
  return (
    <InspectorShell
      ariaLabel={t('transcription.inspectorLabel')}
      headerHeightClassName="h-12"
      tabRowHeightClassName="h-12"
      tabs={[
        { id: 'notes', label: t('transcription.tabs.notes'), icon: <MessageSquare size={16} /> },
        { id: 'history', label: t('transcription.tabs.history'), icon: <History size={16} /> },
        { id: 'assist', label: t('transcription.tabs.assist'), icon: <ScanText size={16} /> },
        { id: 'summary', label: t('transcription.tabs.summary'), icon: <BarChart2 size={16} /> },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => onTabChange(id as TranscriptionInspectorTab)}
      actions={<span className="font-display text-sm italic text-editorial-ink">{t(`transcription.tabs.${activeTab}`)}</span>}
      panelIcon={<Wrench size={15} />}
      panelLabel={t('transcription.inspectorPanelTitle')}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      beforeTabs={
        // Leggere la pagina si fa da qualunque scheda, come avviare la
        // traduzione nel suo Studio.
        document && workspace ? (
          <OcrRunBlock
            document={document}
            workspace={workspace}
            viewerRef={viewerRef}
            segmentId={segment?.id ?? null}
            pageLabel={pageTitleShort}
            starting={ocrStarting}
            reading={ocrReading}
            onStart={onStartOcr}
            onOpenSettings={() => onTabChange('assist')}
          />
        ) : null
      }
      collapsedContent={
        // Leggere la pagina non richiede il pannello aperto.
        document && workspace ? (
          <OcrStartButton
            document={document}
            workspace={workspace}
            viewerRef={viewerRef}
            pageLabel={pageTitleShort}
            starting={ocrStarting}
            reading={ocrReading}
            onStart={onStartOcr}
            tooltipSide="left"
          />
        ) : null
      }
    >
      {activeTab === 'notes' ? (
        notesTab
      ) : activeTab === 'assist' ? (
        <TranscriptionAssistTab
          document={document}
          workspace={workspace}
          onDocumentProviderChange={onDocumentOcrProviderChange}
          onDocumentModelChange={onDocumentOcrModelChange}
          onDocumentPromptChange={onDocumentOcrPromptChange}
          promptDraft={promptDraft}
          onPromptDraftChange={onPromptDraftChange}
          image={ocrImage}
          onImageModeChange={onOcrImageModeChange}
        />
      ) : activeTab === 'history' ? (
        <TranscriptionHistoryTab revisions={revisions} segment={segment} draft={draft}
          formatDate={formatDate} onRestore={onRestore} onDelete={onDeleteRevision}
          onName={onNameRevision} onClear={onClearHistory}
          pending={pagePending} pendingError={pagePendingError} />
      ) : activeTab === 'summary' ? (
        <TranscriptionSummaryTab
          documentId={document?.id ?? null}
          segmentId={segment?.id ?? null}
          displayIndex={displayIndex}
          pageLabel={pageLabel}
          pageTotal={pageTotal}
          verified={verified}
          revisions={revisions}
        />
      ) : null}
    </InspectorShell>
  );
}
