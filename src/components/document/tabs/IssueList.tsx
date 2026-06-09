import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
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
  sourceText?: string;
  resolvedKeys?: Set<string>;
  onToggleResolved?: (key: string) => void;
}

export function IssueList({ issues, chunkId, onSelectChunk, onFocusIssue, sourceText, resolvedKeys, onToggleResolved }: IssueListProps) {
  const { t } = useTranslation();
  const focusedIssueQuery = useUiStore((s) => s.focusedIssueQuery);
  const clearFocusedIssue = useUiStore((s) => s.clearFocusedIssue);
  return (
    <div className="mt-4 space-y-3">
      {issues.map((issue, index) => {
        const issueKey = `${issue.type}-${index}`;
        const isResolved = resolvedKeys?.has(issueKey) ?? false;
        return (
          <article key={issueKey} className={`rounded-2xl border border-editorial-border bg-editorial-bg/80 p-4 shadow-sm transition-opacity ${isResolved ? 'opacity-40' : ''}`}>
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
              <div className="flex items-center gap-1">
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
                {onToggleResolved && (
                  <button
                    type="button"
                    onClick={() => onToggleResolved(issueKey)}
                    title={isResolved ? t('audit.markUnresolved') : t('audit.markResolved')}
                    aria-label={isResolved ? t('audit.markUnresolved') : t('audit.markResolved')}
                    className={`rounded-full border p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                      isResolved
                        ? 'border-editorial-success bg-editorial-success/10 text-editorial-success'
                        : 'border-editorial-border text-editorial-muted hover:border-editorial-success/60 hover:text-editorial-success'
                    }`}
                  >
                    <Check size={10} />
                  </button>
                )}
              </div>
            </div>
            <p className={`text-sm leading-relaxed text-editorial-ink ${isResolved ? 'line-through' : ''}`}>{issue.description}</p>
            {(issue.phrase || sourceText) && (
              <div className="mt-3 space-y-2 rounded-xl border border-editorial-border/50 bg-editorial-textbox/20 px-3 py-2">
                {issue.phrase && (
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-editorial-accent">{t('audit.issuePhraseContext')}</span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-editorial-ink">&ldquo;{issue.phrase}&rdquo;</p>
                  </div>
                )}
                {sourceText && (
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-editorial-muted">{t('audit.issueSourceContext')}</span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-editorial-muted line-clamp-3">{sourceText}</p>
                  </div>
                )}
              </div>
            )}
            {issue.suggestedFix && (
              <div className="mt-3 rounded-xl border border-editorial-border/70 bg-editorial-bg px-3 py-2 text-sm leading-relaxed text-editorial-muted">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-accent">{t('audit.fix')}</span>: {issue.suggestedFix}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
