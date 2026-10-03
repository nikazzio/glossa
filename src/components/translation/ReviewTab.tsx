import { useTranslation } from 'react-i18next';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import type { TranslationChunk } from '../../types';
import { FileText, History, NotebookText, ShieldCheck } from 'lucide-react';
import type { TabStripItem } from '../ui';
import { AuditTab } from '../document/tabs/AuditTab';
import { NotesTab, SourceNotesList } from '../document/tabs/NotesTab';
import { SubTabsPanel, subTabIds } from './SubTabsPanel';
import { TranslationHistoryList } from './TranslationHistoryList';

export type ReviewView = 'audit' | 'notes' | 'sourceNotes' | 'history';

const REVIEW_ID_PREFIX = 'review';

/** Segnalazioni dell'audit ancora da guardare: né risolte né scartate. */
export function openAuditIssueCount(chunk: TranslationChunk | null): number {
  if (!chunk || chunk.judgeResult.status !== 'completed') return 0;
  return chunk.judgeResult.issues.filter((issue) => !issue.resolved && !issue.rejected).length;
}

interface ReviewTabProps {
  panelId: string;
  labelledBy: string;
  view: ReviewView;
  onViewChange: (view: ReviewView) => void;
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  onReauditChunk: (chunkId: string) => void;
  onSelectChunk: (chunkId: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null, sourceQuery?: string | null) => void;
}

/**
 * Revisione del frammento: audit, note, note del testo originale e storico
 * delle versioni in sottolinguette, ognuna con il suo elenco che scorre. Le note del testo
 * compaiono solo se il frammento ne ha; l'audit si accende a frammento
 * tradotto.
 */
export function ReviewTab({
  panelId,
  labelledBy,
  view,
  onViewChange,
  currentChunk,
  isProcessing,
  onReauditChunk,
  onSelectChunk,
  onFocusIssue,
}: ReviewTabProps) {
  const { t } = useTranslation();
  const annotationCount = useAnnotationsStore((s) =>
    currentChunk ? s.annotationsByChunkId.get(currentChunk.id)?.length ?? 0 : 0,
  );
  const footnoteCount = currentChunk?.footnotes?.length ?? 0;
  const auditOff = currentChunk?.status !== 'completed';
  const shownView: ReviewView =
    (view === 'audit' && auditOff) || (view === 'sourceNotes' && footnoteCount === 0) ? 'notes' : view;

  // Le linguette sono icone: nome e conteggio stanno nel suggerimento, il
  // nome della linguetta aperta anche accanto, come nella colonna.
  const withCount = (label: string, count: number) => (count > 0 ? `${label} · ${count}` : label);
  const auditLabel = withCount(t('document.insightsTabAudit'), openAuditIssueCount(currentChunk));
  const labels: Record<ReviewView, string> = {
    audit: auditOff ? `${auditLabel} — ${t('document.chunkTabLockedForAudit')}` : auditLabel,
    notes: withCount(t('document.insightsTabNotes'), annotationCount),
    sourceNotes: withCount(t('document.reviewSourceNotes'), footnoteCount),
    history: t('document.reviewHistory'),
  };
  const tabs: TabStripItem[] = [
    { id: 'audit', label: labels.audit, icon: <ShieldCheck size={16} />, disabled: auditOff },
    { id: 'notes', label: labels.notes, icon: <NotebookText size={16} /> },
    ...(footnoteCount > 0 ? [{ id: 'sourceNotes', label: labels.sourceNotes, icon: <FileText size={16} /> }] : []),
    { id: 'history', label: labels.history, icon: <History size={16} /> },
  ];
  const shownName: Record<ReviewView, string> = {
    audit: t('document.insightsTabAudit'),
    notes: t('document.insightsTabNotes'),
    sourceNotes: t('document.reviewSourceNotes'),
    history: t('document.reviewHistory'),
  };

  const ids = subTabIds(REVIEW_ID_PREFIX, shownView);

  return (
    <SubTabsPanel
      panelId={panelId}
      labelledBy={labelledBy}
      tabs={tabs}
      activeId={shownView}
      onChange={(id) => onViewChange(id as ReviewView)}
      ariaLabel={t('document.reviewViewsLabel')}
      idPrefix={REVIEW_ID_PREFIX}
      activeName={shownName[shownView]}
    >
      {shownView === 'audit' ? (
        <AuditTab
          panelId={ids.panelId}
          labelledBy={ids.tabId}
          currentChunk={currentChunk}
          isProcessing={isProcessing}
          onReauditChunk={onReauditChunk}
          onSelectChunk={onSelectChunk}
          onFocusIssue={onFocusIssue}
        />
      ) : shownView === 'history' ? (
        <TranslationHistoryList panelId={ids.panelId} labelledBy={ids.tabId} currentChunk={currentChunk} />
      ) : shownView === 'sourceNotes' ? (
        <SourceNotesList panelId={ids.panelId} labelledBy={ids.tabId} currentChunk={currentChunk} />
      ) : (
        <NotesTab panelId={ids.panelId} labelledBy={ids.tabId} currentChunk={currentChunk} />
      )}
    </SubTabsPanel>
  );
}
