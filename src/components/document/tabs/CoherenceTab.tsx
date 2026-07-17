import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  ScanLine,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChunksStore } from '../../../stores/chunksStore';
import { IconButton } from '../../ui';
import { IssueList } from './IssueList';
import type { TranslationChunk } from '../../../types';

export interface CoherenceTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  allChunksTranslated: boolean;
  allChunksLocked: boolean;
  unlockedChunksCount: number;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null) => void;
  onRunCoherenceAudit: () => void;
}

export function CoherenceTab({ panelId, labelledBy, currentChunk, isProcessing, allChunksTranslated, allChunksLocked, unlockedChunksCount, onSelectChunk, onFocusIssue, onRunCoherenceAudit }: CoherenceTabProps) {
  const { t } = useTranslation();
  const toggleCoherenceIssueResolved = useChunksStore((s) => s.toggleCoherenceIssueResolved);

  const coherence = currentChunk?.coherenceResult;
  const coherenceDisabled = isProcessing || !allChunksTranslated;
  const coherenceTitle = coherenceDisabled && !isProcessing
    ? t('coherence.translationsRequired')
    : coherence?.status === 'completed' || coherence?.status === 'error'
      ? t('coherence.rerun')
      : t('coherence.runAudit');

  const handleToggleResolved = currentChunk
    ? (issueIndex: number) => toggleCoherenceIssueResolved(currentChunk.id, issueIndex)
    : undefined;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-sans uppercase tracking-[0.35em] text-editorial-muted">
          <Link2 size={11} className="text-editorial-accent shrink-0" /> {t('coherence.title')}
        </div>
        <IconButton
          size="md"
          onClick={onRunCoherenceAudit}
          disabled={coherenceDisabled}
          title={coherenceTitle}
          ariaLabel={t('coherence.runAudit')}
          tooltipSide="left"
        >
          {coherence?.status === 'processing' ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
        </IconButton>
      </div>

      {allChunksTranslated && !allChunksLocked && (
        <div className="mt-3 flex items-start gap-2 border-t border-editorial-warning/30 pt-3 text-sm text-editorial-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{t('coherence.unlockedWarning', { count: unlockedChunksCount })}</span>
        </div>
      )}

      {!coherence || coherence.status === 'idle' ? (
        <p className="mt-3 text-xs text-editorial-muted/70 leading-relaxed">
          {!allChunksTranslated ? t('coherence.translationsRequired') : t('coherence.idle')}
        </p>
      ) : coherence.status === 'processing' ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-editorial-muted">
          <Loader2 size={13} className="animate-spin shrink-0" /> {t('coherence.running')}
        </div>
      ) : coherence.status === 'error' ? (
        <div className="mt-3 border-t border-editorial-danger/30 pt-3 text-sm text-editorial-danger">
          {coherence.error || t('errors.coherenceFailed')}
        </div>
      ) : coherence.issues.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-editorial-success">
          <CheckCircle2 size={14} /> {t('coherence.noIssues')}
        </div>
      ) : currentChunk ? (
        <IssueList
          issues={coherence.issues}
          chunkId={currentChunk.id}
          onSelectChunk={onSelectChunk}
          onFocusIssue={onFocusIssue}
          onToggleResolved={handleToggleResolved}
        />
      ) : null}
    </div>
  );
}
