import { BarChart2, History, Info, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InspectorShell, StatRow } from '../ui';
import type {
  TranscriptionDocument,
  TranscriptionRevision,
  TranscriptionSegment,
} from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { ModelProvider, Workspace } from '../../types';
import { TranscriptionAssistTab } from './TranscriptionAssistTab';
import { OcrStartButton } from './OcrStartButton';
import type { OcrImageMode, OcrImagePreferences } from '../../services/ocrImageSettingsService';
import { TranscriptionSummaryTab } from './TranscriptionSummaryTab';
import { TranscriptionHistoryTab } from './TranscriptionHistoryTab';

export type TranscriptionInspectorTab = 'history' | 'assist' | 'summary' | 'metadata';

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
}: TranscriptionInspectorProps) {
  const { t } = useTranslation();
  return (
    <InspectorShell
      ariaLabel={t('transcription.inspectorLabel')}
      headerHeightClassName="h-12"
      tabRowHeightClassName="h-12"
      tabs={[
        {
          id: 'assist',
          label: t('transcription.tabs.assist'),
          icon: <Sparkles size={13} />,
        },
        { id: 'history', label: t('transcription.tabs.history'), icon: <History size={13} /> },
        { id: 'summary', label: t('transcription.tabs.summary'), icon: <BarChart2 size={13} /> },
        { id: 'metadata', label: t('transcription.tabs.metadata'), icon: <Info size={13} /> },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => onTabChange(id as TranscriptionInspectorTab)}
      actions={<span className="font-display text-sm italic text-editorial-ink">{t(`transcription.tabs.${activeTab}`)}</span>}
      panelIcon={<History size={15} />}
      panelLabel={t('transcription.inspectorPanelTitle')}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
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
      {activeTab === 'assist' ? (
        <TranscriptionAssistTab
          document={document}
          workspace={workspace}
          viewerRef={viewerRef}
          pageLabel={pageTitleShort}
          starting={ocrStarting}
          reading={ocrReading}
          onStartOcr={onStartOcr}
          onDocumentProviderChange={onDocumentOcrProviderChange}
          onDocumentModelChange={onDocumentOcrModelChange}
          onDocumentPromptChange={onDocumentOcrPromptChange}
          image={ocrImage}
          onImageModeChange={onOcrImageModeChange}
        />
      ) : activeTab === 'history' ? (
        <TranscriptionHistoryTab revisions={revisions} segment={segment} draft={draft}
          formatDate={formatDate} onRestore={onRestore} onDelete={onDeleteRevision}
          onName={onNameRevision} onClear={onClearHistory}
          pending={pagePending} pendingError={pagePendingError} />
      ) : activeTab === 'summary' ? (
        <TranscriptionSummaryTab documentId={document?.id ?? null} pageTotal={pageTotal} revisionCount={revisions.length} />
      ) : activeTab === 'metadata' ? (
        <dl className="flex flex-col gap-3 p-4">
          <StatRow label={t('transcription.meta.page')} value={displayIndex + 1} />
          <StatRow label={t('transcription.meta.pageLabel')} value={pageLabel ?? '—'} />
          <StatRow
            label={t('transcription.meta.status')}
            value={t(verified ? 'transcription.verifiedBadge' : 'transcription.draftBadge')}
          />
          <StatRow label={t('transcription.meta.revisionCount')} value={revisions.length} />
          <StatRow label={t('transcription.meta.segmentId')} value={segment?.id ?? '—'} />
          <StatRow
            label={t('transcription.meta.sourcePageId')}
            value={segment?.source_page_id ?? t('transcription.meta.sourcePageIdUnset')}
          />
        </dl>
      ) : null}
    </InspectorShell>
  );
}
