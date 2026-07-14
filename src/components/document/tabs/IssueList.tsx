import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  Crosshair,
  Link2,
  MessageCircle,
  NotebookPen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { IconButton } from '../../ui';
import type { TranslationChunk } from '../../../types';

export interface IssueListProps {
  issues: TranslationChunk['judgeResult']['issues'];
  chunkId: string;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null, sourceQuery?: string | null) => void;
  onToggleResolved?: (issueIndex: number) => void;
}

type Issue = TranslationChunk['judgeResult']['issues'][number];

const ISSUE_TYPE_ICON: Record<Issue['type'], LucideIcon> = {
  fluency: MessageCircle,
  accuracy: AlertTriangle,
  grammar: AlertCircle,
  consistency: Link2,
  glossary: BookOpen,
};

const SEVERITY_META: Record<Issue['severity'], { textClass: string }> = {
  high: {
    textClass: 'text-editorial-danger',
  },
  medium: {
    textClass: 'text-editorial-warning',
  },
  low: {
    textClass: 'text-editorial-muted',
  },
};

export function IssueList({ issues, chunkId, onSelectChunk, onFocusIssue, onToggleResolved }: IssueListProps) {
  const { t } = useTranslation();
  const focusedIssueQuery = useUiStore((s) => s.focusedIssueQuery);
  const clearFocusedIssue = useUiStore((s) => s.clearFocusedIssue);
  const setPendingAnnotationAnchor = useUiStore((s) => s.setPendingAnnotationAnchor);
  const setChunkRailTab = useUiStore((s) => s.setChunkRailTab);
  const setProjectContextCollapsed = useUiStore((s) => s.setProjectContextCollapsed);
  return (
    <div className="mt-4 divide-y divide-editorial-border/55">
      {issues.map((issue, index) => {
        const issueKey = `${issue.type}-${index}`;
        const isResolved = issue.resolved ?? false;
        const isActive = !!issue.phrase && focusedIssueQuery === issue.phrase;
        const IssueIcon = ISSUE_TYPE_ICON[issue.type] ?? BookOpen;
        const severityMeta = SEVERITY_META[issue.severity];
        return (
          <article
            key={issueKey}
            className={`group py-3 transition-opacity ${isResolved ? 'opacity-40' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <IssueIcon size={13} className={`shrink-0 ${severityMeta.textClass}`} />
                  <span className={`truncate text-[11px] font-bold uppercase tracking-[0.14em] ${severityMeta.textClass}`}>
                    {issue.type}
                  </span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-editorial-border" aria-hidden="true" />
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-editorial-muted">
                    {issue.severity}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {issue.phrase && (
                  <IconButton
                    size="sm"
                    tone={isActive ? 'accent' : 'default'}
                    onClick={() => {
                      if (isActive) {
                        clearFocusedIssue();
                      } else {
                        onSelectChunk(chunkId);
                        onFocusIssue(chunkId, issue.phrase, issue.sourcePhrase ?? null);
                      }
                    }}
                    title={t('audit.locateInTextTooltip')}
                    ariaPressed={isActive}
                    tooltipSide="left"
                    className="h-7 w-7"
                  >
                    <Crosshair size={11} />
                  </IconButton>
                )}
                <IconButton
                  size="sm"
                  tone="default"
                  onClick={() => {
                    onSelectChunk(chunkId);
                    setProjectContextCollapsed(false);
                    setPendingAnnotationAnchor({
                      chunkId,
                      text: issue.phrase ?? '',
                      content: `[Audit] ${issue.description}`,
                    });
                    setChunkRailTab('notes');
                  }}
                  title={t('annotations.createFromIssue')}
                  tooltipSide="left"
                  className="h-7 w-7"
                >
                  <NotebookPen size={11} />
                </IconButton>
                {onToggleResolved && (
                  <IconButton
                    size="sm"
                    tone={isResolved ? 'success' : 'default'}
                    onClick={() => {
                      if (isActive) clearFocusedIssue();
                      onToggleResolved(index);
                    }}
                    title={isResolved ? t('audit.markUnresolved') : t('audit.markResolved')}
                    ariaLabel={isResolved ? t('audit.markUnresolved') : t('audit.markResolved')}
                    tooltipSide="left"
                    className="h-7 w-7"
                  >
                    <Check size={10} />
                  </IconButton>
                )}
              </div>
            </div>
            <p className={`mt-2 w-full text-sm leading-relaxed text-editorial-ink ${isResolved ? 'line-through' : ''}`}>
              {issue.description}
            </p>

            {(issue.phrase || issue.sourcePhrase) && (
              <div className="mt-3 ml-5 space-y-3 border-l border-editorial-border/70 pl-3">
                {issue.phrase && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-accent">
                      {t('audit.issuePhraseContext')}
                    </span>
                    <p className="mt-0.5 w-full font-display text-sm italic leading-snug text-editorial-ink">
                      &ldquo;{issue.phrase}&rdquo;
                    </p>
                  </div>
                )}
                {issue.sourcePhrase && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-muted">
                      {t('audit.issueSourcePhraseContext')}
                    </span>
                    <p className="mt-0.5 w-full font-display text-sm italic leading-snug text-editorial-muted">
                      &ldquo;{issue.sourcePhrase}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}

            {issue.suggestedFix && (
              <div className="mt-3 ml-5 min-w-0 border-l border-editorial-border/70 pl-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-accent">
                  {t('audit.fix')}
                </span>
                <p className="mt-0.5 w-full text-sm leading-relaxed text-editorial-muted">{issue.suggestedFix}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
