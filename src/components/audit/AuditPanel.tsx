import { ShieldCheck, RefreshCcw, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { calculateCompositeQuality, indexPad, qualityLabelKey, qualityTone } from '../../utils';
import { confirm } from '../../stores/confirmStore';

interface AuditPanelProps {
  onRunAuditOnly: () => void;
}

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

export function AuditPanel({ onRunAuditOnly }: AuditPanelProps) {
  const { chunks, clearChunks, isProcessing } = usePipelineStore();
  const { t } = useTranslation();

  const hasCompletedAudits = chunks.length > 0 && chunks.some((c) => c.judgeResult.status === 'completed');
  const hasErrorAudits = chunks.length > 0 && chunks.some((c) => c.judgeResult.status === 'error');
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

  return (
    <section className="col-span-1 md:col-span-3 p-8 bg-editorial-bg overflow-y-auto max-h-[calc(100vh-140px)] flex flex-col gap-10 custom-scrollbar">
      <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-4 inline-block">
        {t('audit.title')}
      </h2>

      <div className="flex flex-col gap-12 flex-1">
        {hasCompletedAudits || hasErrorAudits ? (
          <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Score */}
            {hasCompletedAudits && (
              <div className="space-y-6" title={compositeTitle} aria-label={compositeTitle}>
                <div className="space-y-1">
                  <div className={`text-5xl font-display text-center tracking-tighter ${QUALITY_TONE_COLOR[compositeTone]}`}>
                    {compositeLevelLabel}
                  </div>
                  <div className="text-[8px] text-center uppercase font-bold tracking-[4px] text-editorial-muted">
                    {t('audit.compositeQuality')}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[9px] font-bold uppercase tracking-[2px] text-editorial-muted border-b border-editorial-border pb-1">
                    {t('audit.chunkQuality')}
                  </label>
                  {chunks.map((chunk, index) => (
                    chunk.judgeResult.status === 'completed' && (
                      <div key={chunk.id} className="flex items-center justify-between text-[10px] font-mono border border-editorial-border/70 px-3 py-2">
                        <span className="text-editorial-muted">
                          {t('pipeline.unit')} {indexPad(index + 1)}
                        </span>
                        <span className={QUALITY_TONE_COLOR[qualityTone(chunk.judgeResult.rating)]}>
                          {t(qualityLabelKey(chunk.judgeResult.rating))}
                        </span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Audit Errors */}
            {hasErrorAudits && (
              <div className="space-y-3">
                {chunks
                  .filter((c) => c.judgeResult.status === 'error')
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-2 bg-editorial-textbox/30 border border-editorial-accent/30 p-3 text-editorial-accent"
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span className="text-[10px] font-mono">
                        {c.judgeResult.error || t('audit.auditFailed')}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Issues */}
            <div className="space-y-4">
              <label className="block text-[9px] font-bold uppercase tracking-[2px] text-editorial-muted border-b border-editorial-border pb-1">
                {t('audit.anomaliesDetected')}
              </label>
              <ul className="divide-y divide-editorial-border/50">
                {chunks
                  .flatMap((c) => c.judgeResult.issues)
                  .map((issue, i) => (
                    <li key={i} className="py-4 hover:bg-editorial-textbox/30 px-2 -mx-2 transition-colors rounded-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                            issue.severity === 'high' ? 'bg-editorial-accent text-white' : 'bg-editorial-ink text-white'
                          }`}
                        >
                          {issue.type}
                        </span>
                      </div>
                      <span className="font-display italic text-sm leading-snug block text-editorial-ink">
                        &quot;{issue.description}&quot;
                      </span>
                      {issue.suggestedFix && (
                        <div className="mt-2 text-[10px] font-mono text-editorial-muted bg-editorial-bg p-2 rounded-sm border-l-2 border-editorial-accent">
                          {t('audit.fix')}: {issue.suggestedFix}
                        </div>
                      )}
                    </li>
                  ))}
                {allClear && (
                  <div className="text-center py-20 opacity-20 italic font-display flex flex-col items-center gap-4">
                    <ShieldCheck size={40} strokeWidth={1} />
                    <span className="text-[10px] uppercase tracking-widest">{t('audit.pipelineClear')}</span>
                  </div>
                )}
              </ul>
            </div>
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
          disabled={chunks.length === 0}
          title={chunks.length === 0 ? t('pipeline.runDisabledNoChunks') : t('audit.clearStream')}
          className="w-full border border-editorial-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-editorial-textbox/50 hover:text-editorial-accent transition-all flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('audit.clearStream')}
        </button>
      </div>
    </section>
  );
}
