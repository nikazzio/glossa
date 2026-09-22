import { FileInput, History, Info, RotateCcw, ScanText, ScrollText, Sparkles, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, InspectorShell, StatRow } from '../ui';
import type {
  TranscriptionDocument,
  TranscriptionRevision,
  TranscriptionSegment,
} from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { ModelProvider, Workspace } from '../../types';
import { PagePendingOverlay } from './PagePendingOverlay';
import { TranscriptionAssistTab } from './TranscriptionAssistTab';
import { TranscriptionLogTab } from './TranscriptionLogTab';

export type TranscriptionInspectorTab = 'history' | 'assist' | 'metadata' | 'log';

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
  pagePending: boolean;
  pagePendingError: string | null;
  displayIndex: number;
  pageLabel: string | null;
  verified: boolean;
  document: TranscriptionDocument | null;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'> | null;
  viewerRef: ViewerVersionRef | null;
  ocrStarting: boolean;
  onStartOcr: () => void;
  onDocumentOcrProviderChange: (provider: ModelProvider | '', model: string) => void;
  onDocumentOcrModelChange: (model: string) => void;
  onDocumentOcrPromptChange: (prompt: string) => void;
  onSegmentOcrPromptChange: (prompt: string) => void;
}

const AUTHOR_ICONS = { user: User, ocr: ScanText, import: FileInput } as const;

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
  pagePending,
  pagePendingError,
  displayIndex,
  pageLabel,
  verified,
  document,
  workspace,
  viewerRef,
  ocrStarting,
  onStartOcr,
  onDocumentOcrProviderChange,
  onDocumentOcrModelChange,
  onDocumentOcrPromptChange,
  onSegmentOcrPromptChange,
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
        { id: 'log', label: t('transcription.tabs.log'), icon: <ScrollText size={13} /> },
        { id: 'metadata', label: t('transcription.tabs.metadata'), icon: <Info size={13} /> },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => onTabChange(id as TranscriptionInspectorTab)}
      panelIcon={<History size={15} />}
      panelLabel={t('transcription.inspectorPanelTitle')}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
    >
      {activeTab === 'assist' ? (
        <TranscriptionAssistTab
          document={document}
          segment={segment}
          workspace={workspace}
          viewerRef={viewerRef}
          starting={ocrStarting}
          onStartOcr={onStartOcr}
          onDocumentProviderChange={onDocumentOcrProviderChange}
          onDocumentModelChange={onDocumentOcrModelChange}
          onDocumentPromptChange={onDocumentOcrPromptChange}
          onSegmentPromptChange={onSegmentOcrPromptChange}
        />
      ) : activeTab === 'log' ? (
        document ? (
          <TranscriptionLogTab
            documentId={document.id}
            panelId="transcription-log-panel"
            labelledBy="transcription-log-tab"
          />
        ) : null
      ) : activeTab === 'history' ? (
        <div className="relative flex min-h-0 flex-1 flex-col gap-2 p-3">
          {revisions.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-editorial-muted">
              {t('transcription.noRevisions')}
            </p>
          ) : (
            revisions.map((revision) => {
              const Icon = AUTHOR_ICONS[revision.created_by];
              const isApproved = revision.id === segment?.approved_revision_id;
              const isCurrent = revision.text === draft;
              return (
                <div
                  key={revision.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                    isApproved ? 'border-editorial-success/40 bg-editorial-success/5' : 'border-editorial-border'
                  }`}
                >
                  <Icon size={13} className="mt-0.5 shrink-0 text-editorial-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-editorial-muted">
                      <span>{t(`transcription.authorLabels.${revision.created_by}`)}</span>
                      <span>·</span>
                      <span>{formatDate(revision.created_at)}</span>
                      {isApproved && (
                        <span className="text-editorial-success">· {t('transcription.verifiedBadge')}</span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-editorial-ink">{revision.text}</p>
                  </div>
                  {!isCurrent && (
                    <IconButton
                      size="xs"
                      onClick={() => onRestore(revision.id)}
                      title={t('transcription.restore')}
                      disabled={pagePending}
                    >
                      <RotateCcw size={12} />
                    </IconButton>
                  )}
                </div>
              );
            })
          )}
          <PagePendingOverlay
            pending={pagePending}
            errorMessage={pagePendingError}
            roundedClassName="rounded-none"
          />
        </div>
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
