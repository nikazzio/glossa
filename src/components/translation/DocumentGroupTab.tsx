import { BarChart2, Link2, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChunkWatchdog } from '../../hooks/useChunkWatchdog';
import type { TranslationChunk } from '../../types';
import type { TabStripItem } from '../ui';
import { CoherenceTab } from '../document/tabs/CoherenceTab';
import { IndexTab } from '../document/tabs/IndexTab';
import { StatsTab } from '../document/tabs/StatsTab';
import { SubTabsPanel, subTabIds } from './SubTabsPanel';

export type DocumentView = 'index' | 'stats' | 'coherence';

const DOCUMENT_ID_PREFIX = 'document-summary';

const VIEW_LABEL_KEY: Record<DocumentView, string> = {
  index: 'document.insightsTabIndex',
  stats: 'document.insightsTabStats',
  coherence: 'document.insightsTabCoherence',
};

interface DocumentGroupTabProps {
  panelId: string;
  labelledBy: string;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  chunks: TranslationChunk[];
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  onSelectChunk: (chunkId: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null, sourceQuery?: string | null) => void;
  onRunCoherenceAudit: () => void;
}

/**
 * I riepiloghi del documento intero, non del frammento aperto: indice dei
 * frammenti, statistiche e controllo di coerenza, in tre sottolinguette.
 */
export function DocumentGroupTab({
  panelId,
  labelledBy,
  view,
  onViewChange,
  chunks,
  currentChunk,
  isProcessing,
  onSelectChunk,
  onFocusIssue,
  onRunCoherenceAudit,
}: DocumentGroupTabProps) {
  const { t } = useTranslation();
  const { stuckChunkIds, cancelStuckChunk } = useChunkWatchdog();
  const allChunksTranslated = chunks.length > 0 && chunks.every((c) => c.translationDisplayText.trim());
  const allChunksLocked = chunks.length > 0 && chunks.every((c) => c.translationLocked);
  const unlockedChunksCount = chunks.filter((c) => c.translationDisplayText.trim() && !c.translationLocked).length;

  const tabs: TabStripItem[] = [
    { id: 'index', label: t(VIEW_LABEL_KEY.index), icon: <List size={16} /> },
    { id: 'stats', label: t(VIEW_LABEL_KEY.stats), icon: <BarChart2 size={16} /> },
    { id: 'coherence', label: t(VIEW_LABEL_KEY.coherence), icon: <Link2 size={16} /> },
  ];
  const ids = subTabIds(DOCUMENT_ID_PREFIX, view);

  return (
    <SubTabsPanel
      panelId={panelId}
      labelledBy={labelledBy}
      tabs={tabs}
      activeId={view}
      onChange={(id) => onViewChange(id as DocumentView)}
      ariaLabel={t('document.insightsTabDocument')}
      idPrefix={DOCUMENT_ID_PREFIX}
      activeName={t(VIEW_LABEL_KEY[view])}
      // L'indice scorre da sé: tiene in vista il frammento aperto.
      bodyScrolls={view !== 'index'}
    >
      {view === 'index' ? (
        <IndexTab
          panelId={ids.panelId}
          labelledBy={ids.tabId}
          chunks={chunks}
          currentChunkId={currentChunk?.id ?? null}
          stuckChunkIds={stuckChunkIds}
          onSelect={onSelectChunk}
          onCancelStuck={cancelStuckChunk}
        />
      ) : view === 'stats' ? (
        <StatsTab panelId={ids.panelId} labelledBy={ids.tabId} chunks={chunks} />
      ) : (
        <CoherenceTab
          panelId={ids.panelId}
          labelledBy={ids.tabId}
          currentChunk={currentChunk}
          isProcessing={isProcessing}
          allChunksTranslated={allChunksTranslated}
          allChunksLocked={allChunksLocked}
          unlockedChunksCount={unlockedChunksCount}
          onSelectChunk={onSelectChunk}
          onFocusIssue={onFocusIssue}
          onRunCoherenceAudit={onRunCoherenceAudit}
        />
      )}
    </SubTabsPanel>
  );
}
