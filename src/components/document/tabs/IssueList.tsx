import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Crosshair,
  Link2,
  MessageCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { IconButton } from '../../ui';
import type { TranslationChunk } from '../../../types';

export interface IssueListProps {
  issues: TranslationChunk['judgeResult']['issues'];
  chunkId: string;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null) => void;
}

export function IssueList({ issues, chunkId, onSelectChunk, onFocusIssue }: IssueListProps) {
  const { t } = useTranslation();
  const focusedIssueQuery = useUiStore((s) => s.focusedIssueQuery);
  const clearFocusedIssue = useUiStore((s) => s.clearFocusedIssue);
  return (
    <div className="mt-4 space-y-3">
      {issues.map((issue, index) => (
        <article key={`${issue.type}-${index}`} className="rounded-2xl border border-editorial-border bg-editorial-bg/80 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-full p-1 ${issue.severity === 'high' ? 'bg-editorial-accent text-white' : issue.severity === 'medium' ? 'bg-editorial-warning/80 text-white' : 'bg-editorial-border text-editorial-muted'}`}>
                {issue.type === 'fluency' ? <MessageCircle size={11} /> :
                 issue.type === 'accuracy' ? <AlertTriangle size={11} /> :
                 issue.type === 'grammar' ? <AlertCircle size={11} /> :
                 issue.type === 'consistency' ? <Link2 size={11} /> :
                 <BookOpen size={11} />}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-ink">{issue.type}</span>
            </div>
            {issue.phrase && (() => {
              const isActive = focusedIssueQuery === issue.phrase;
              return (
                <IconButton
                  size="sm"
                  tone={isActive ? 'accent' : 'default'}
                  onClick={() => {
                    if (isActive) {
                      clearFocusedIssue();
                    } else {
                      onSelectChunk(chunkId);
                      onFocusIssue(chunkId, issue.phrase);
                    }
                  }}
                  title={t('audit.locateInTextTooltip')}
                  ariaPressed={isActive}
                  tooltipSide="left"
                >
                  <Crosshair size={13} />
                </IconButton>
              );
            })()}
          </div>
          <p className="text-sm leading-relaxed text-editorial-ink">{issue.description}</p>
          {issue.suggestedFix && (
            <div className="mt-3 rounded-xl border border-editorial-border/70 bg-editorial-bg px-3 py-2 text-sm leading-relaxed text-editorial-muted">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-accent">{t('audit.fix')}</span>: {issue.suggestedFix}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
