import { ChevronDown, ChevronRight, ScanLine, ShieldCheck, RefreshCcw, AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { calculateCompositeQuality, indexPad, qualityLabelKey, qualityTone } from '../../utils';
import { confirm } from '../../stores/confirmStore';
import type { TranslationChunk } from '../../types';

interface AuditPanelProps {
  onRunAuditOnly: () => void;
  onReauditChunk: (chunkId: string) => void;
}

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

export function AuditPanel({ onRunAuditOnly, onReauditChunk }: AuditPanelProps) {
  const { chunks, clearChunks, isProcessing } = useChunksStore();
  const { t } = useTranslation();

  // Track which chunks are expanded in the drill-down. Default closed.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const auditedChunks = useMemo(
    () => chunks.filter((c) => c.judgeResult.status === 'completed' || c.judgeResult.status === 'error'),
    [chunks],
  );
  const hasCompletedAudits = auditedChunks.some((c) => c.judgeResult.status === 'completed');
  const allClear =
    chunks.length > 0 &&
    chunks.every((c) => c.judgeResult.status === 'completed' && c.judgeResult.issues.length === 0);

  const compositeQuality = calculateCompositeQuality(chunks);
  const compositeTone = qualityTone(compositeQuality);
  const compositeLevelLabel = t(qualityLabelKey(compositeQuality));
  const compositeTitle = `${compositeLevelLabel} - ${t('audit.compositeTooltip')}`;

  const cannotRun = isProcessing || chunks.length === 0;
  const reEvaluateReason = isProcessing
    ? t('pipeline.runDisabledProcessing')
    : chunks.length === 0
      ? t('pipeline.runDisabledNoChunks')
      : undefined;

  const handleClearStream = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmClearTitle'),
      message: t('pipeline.confirmClearMessage'),
      confirmLabel: t('audit.clearStream'),
      danger: true,
    });
    if (ok) clearChunks();
  };

  const toggleExpanded = (chunkId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  };

  return (
    <section className="col-span-1 md:col-span-3 p-8 bg-editorial-bg overflow-y-auto min-h-0 h-full flex flex-col gap-10 custom-scrollbar">
      <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-4 inline-block">
        {t('audit.title')}
      </h2>

      <div className="flex flex-col gap-12 flex-1">
        {auditedChunks.length > 0 ? (
          <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Composite Score */}
            {hasCompletedAudits && (
              <div className="space-y-2" title={compositeTitle} aria-label={compositeTitle}>
                <div className={`text-5xl font-display text-center tracking-tighter ${QUALITY_TONE_COLOR[compositeTone]}`}>
                  {compositeLevelLabel}
                </div>
                <div className="text-[8px] text-center uppercase font-bold tracking-[4px] text-editorial-muted">
                  {t('audit.compositeQuality')}
                </div>
              </div>
            )}

            {/* Per-chunk drill-down */}
            <div className="space-y-3">
              <label className="block text-[9px] font-bold uppercase tracking-[2px] text-editorial-muted border-b border-editorial-border pb-1">
                {t('audit.chunkQuality')}
              </label>
              {chunks.map((chunk, index) => {
                if (chunk.judgeResult.status !== 'completed' && chunk.judgeResult.status !== 'error') {
                  return null;
                }
                return (
                  <ChunkAuditCard
                    key={chunk.id}
                    chunk={chunk}
                    index={index}
                    isExpanded={expanded.has(chunk.id)}
                    onToggle={() => toggleExpanded(chunk.id)}
                    onReaudit={() => onReauditChunk(chunk.id)}
                    isProcessing={isProcessing}
                  />
                );
              })}
            </div>

            {allClear && (
              <div className="text-center py-12 opacity-25 italic font-display flex flex-col items-center gap-4">
                <ShieldCheck size={40} strokeWidth={1} />
                <span className="text-[10px] uppercase tracking-widest">{t('audit.pipelineClear')}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-10 font-display text-center px-6">
            <ShieldCheck size={48} strokeWidth={1} />
            <span className="text-[10px] uppercase tracking-[4px] font-bold mt-4">{t('audit.noRecord')}</span>
          </div>
        )}
      </div>

      <div className="mt-auto space-y-4">
        <button
          onClick={onRunAuditOnly}
          disabled={cannotRun}
          title={reEvaluateReason ?? t('audit.reEvaluate')}
          className="w-full bg-transparent border border-editorial-ink text-editorial-ink px-4 py-4 text-[11px] font-bold uppercase tracking-[3px] hover:bg-editorial-ink hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed group shadow-sm active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
        >
          <RefreshCcw size={14} className={isProcessing ? 'animate-spin' : ''} /> {t('audit.reEvaluate')}
        </button>
        <button
          onClick={handleClearStream}
          disabled={chunks.length === 0 || isProcessing}
          title={chunks.length === 0 ? t('pipeline.runDisabledNoChunks') : isProcessing ? t('pipeline.runDisabledProcessing') : t('audit.clearStream')}
          className="w-full border border-editorial-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-editorial-textbox/50 hover:text-editorial-accent transition-all flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('audit.clearStream')}
        </button>
      </div>
    </section>
  );
}

interface ChunkAuditCardProps {
  chunk: TranslationChunk;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onReaudit: () => void;
  isProcessing: boolean;
}

function ChunkAuditCard({
  chunk, index, isExpanded, onToggle, onReaudit, isProcessing,
}: ChunkAuditCardProps) {
  const { t } = useTranslation();
  const { focusIssueInChunk, setSelectedChunkId, setViewMode } = useUiStore();
  const { judgeResult } = chunk;
  const isError = judgeResult.status === 'error';
  const issues = judgeResult.issues;
  const hasIssues = issues.length > 0;

  const ratingTone = qualityTone(judgeResult.rating);
  const ratingLabel = t(qualityLabelKey(judgeResult.rating));

  const cardId = `audit-card-${chunk.id}`;
  const panelId = `audit-panel-${chunk.id}`;

  return (
    <div className="border border-editorial-border/70 bg-editorial-textbox/10">
      <div className="flex items-center gap-1">
        <button
          type="button"
          id={cardId}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex-1 flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-editorial-textbox/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <span className="flex items-center gap-2 text-[10px] font-mono">
            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="text-editorial-muted">
              {t('pipeline.unit')} {indexPad(index + 1)}
            </span>
            {isError ? (
              <span className="text-editorial-accent flex items-center gap-1">
                <AlertTriangle size={11} /> {t('audit.auditFailed')}
              </span>
            ) : (
              <span className={QUALITY_TONE_COLOR[ratingTone]}>{ratingLabel}</span>
            )}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-editorial-muted">
            {hasIssues ? t('audit.issuesCount', { count: issues.length }) : t('audit.noIssues')}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReaudit(); }}
          disabled={isProcessing || !chunk.currentDraft}
          title={chunk.currentDraft ? t('pipeline.reauditChunk') : t('pipeline.auditSkippedNoDraft')}
          aria-label={t('pipeline.reauditChunk')}
          className="px-2 py-2 text-editorial-muted hover:text-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <ScanLine size={12} />
        </button>
      </div>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={cardId}
          className="border-t border-editorial-border/50 px-3 py-3 space-y-3 animate-in fade-in duration-200"
        >
          {isError && (
            <div className="flex items-start gap-2 text-editorial-accent text-[10px] font-mono">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{judgeResult.error || t('audit.auditFailed')}</span>
            </div>
          )}
          {!isError && !hasIssues && (
            <div className="text-[10px] italic text-editorial-muted py-2">
              {t('audit.noIssues')}
            </div>
          )}
          {hasIssues && (
            <ul className="space-y-3">
              {issues.map((issue, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                        issue.severity === 'high' ? 'bg-editorial-accent text-white' : 'bg-editorial-ink text-white'
                      }`}
                    >
                      {issue.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('document');
                        setSelectedChunkId(chunk.id);
                        focusIssueInChunk(chunk.id, extractIssueFocusQuery(issue));
                      }}
                      className="rounded-full border border-editorial-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-editorial-muted transition-colors hover:text-editorial-ink"
                    >
                      {t('audit.openChunk')}
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-editorial-ink">
                    {issue.description}
                  </p>
                  {issue.suggestedFix && (
                    <div className="rounded-xl border border-editorial-border/70 bg-editorial-bg px-3 py-2 text-[11px] leading-relaxed text-editorial-muted">
                      {t('audit.fix')}: {issue.suggestedFix}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function extractIssueFocusQuery(issue: TranslationChunk['judgeResult']['issues'][number]): string | null {
  const candidates = [
    ...Array.from(issue.description.matchAll(/"([^"]{3,})"/g)).map((match) => match[1]),
    ...Array.from(issue.suggestedFix?.matchAll(/"([^"]{3,})"/g) ?? []).map((match) => match[1]),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}
