import { CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../ui';
import { IssueList } from './IssueList';
import { qualityLabelKey, qualityTone } from '../../../utils';
import { useChunksStore } from '../../../stores/chunksStore';
import type { TranslationChunk } from '../../../types';

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-danger',
};

export interface AuditTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  onReauditChunk: (chunkId: string) => void;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null, sourceQuery?: string | null) => void;
}

export function AuditTab({ panelId, labelledBy, currentChunk, isProcessing, onReauditChunk, onSelectChunk, onFocusIssue }: AuditTabProps) {
  const { t } = useTranslation();
  const toggleJudgeIssueResolved = useChunksStore((s) => s.toggleJudgeIssueResolved);
  const handleToggleResolved = useCallback((issueIndex: number) => {
    if (currentChunk) toggleJudgeIssueResolved(currentChunk.id, issueIndex);
  }, [currentChunk, toggleJudgeIssueResolved]);

  if (!currentChunk) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-6 py-8 text-sm text-editorial-muted">
        {t('document.insightsAuditEmpty')}
      </div>
    );
  }

  const tone = qualityTone(currentChunk.judgeResult.rating);
  const qualityLabel = currentChunk.judgeResult.status === 'completed'
    ? t(qualityLabelKey(currentChunk.judgeResult.rating))
    : t('audit.ratingNone');

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">{t('audit.title')}</div>
          <div className={`mt-1.5 font-display text-xl italic ${QUALITY_TONE_COLOR[tone]}`}>{qualityLabel}</div>
        </div>
        <IconButton
          size="md"
          onClick={() => onReauditChunk(currentChunk.id)}
          disabled={isProcessing || !currentChunk.translationDisplayText}
          title={t('pipeline.reauditChunk')}
          tooltipSide="left"
        >
          <RefreshCcw size={14} className={currentChunk.judgeResult.status === 'processing' ? 'animate-spin' : ''} />
        </IconButton>
      </div>

      {currentChunk.judgeResult.status === 'error' && (
        <div className="mt-4 border-t border-editorial-danger/25 pt-3 text-sm leading-relaxed text-editorial-danger">
          {currentChunk.judgeResult.error || t('audit.auditFailed')}
        </div>
      )}
      {currentChunk.judgeResult.status === 'processing' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-editorial-running">
          <Loader2 size={13} className="animate-spin shrink-0" />
          <span>{t('document.insightsAuditProcessing')}</span>
        </div>
      )}
      {currentChunk.judgeResult.status !== 'error'
        && currentChunk.judgeResult.status !== 'completed'
        && currentChunk.judgeResult.status !== 'processing' && (
        <div className="mt-3 text-sm text-editorial-muted">
          {t('document.insightsAuditEmpty')}
        </div>
      )}
      {currentChunk.judgeResult.status === 'completed' && currentChunk.judgeResult.issues.length === 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm text-editorial-success">
          <CheckCircle2 size={14} /> {t('document.insightsAuditNoIssues')}
        </div>
      )}
      {currentChunk.judgeResult.issues.length > 0 && (
        <IssueList
          issues={currentChunk.judgeResult.issues}
          chunkId={currentChunk.id}
          onSelectChunk={onSelectChunk}
          onFocusIssue={onFocusIssue}
          onToggleResolved={handleToggleResolved}
        />
      )}
    </div>
  );
}
