import { ShieldCheck, RefreshCcw, AlertTriangle } from 'lucide-react';
import { usePipelineStore } from '../../stores/pipelineStore';
import { calculateCompositeScore } from '../../utils';

interface AuditPanelProps {
  onRunAuditOnly: () => void;
}

export function AuditPanel({ onRunAuditOnly }: AuditPanelProps) {
  const { chunks, clearChunks, isProcessing } = usePipelineStore();

  const hasCompletedAudits = chunks.length > 0 && chunks.some((c) => c.judgeResult.status === 'completed');
  const hasErrorAudits = chunks.length > 0 && chunks.some((c) => c.judgeResult.status === 'error');
  const allClear =
    chunks.length > 0 &&
    chunks.every((c) => c.judgeResult.status === 'completed' && c.judgeResult.issues.length === 0);

  return (
    <section className="col-span-1 md:col-span-3 p-8 bg-editorial-bg overflow-y-auto max-h-[calc(100vh-140px)] flex flex-col gap-10 custom-scrollbar">
      <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-4 inline-block">
        Audit Logs
      </h2>

      <div className="flex flex-col gap-12 flex-1">
        {hasCompletedAudits || hasErrorAudits ? (
          <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Score */}
            {hasCompletedAudits && (
              <div className="space-y-1">
                <div className="text-7xl font-display text-center tracking-tighter">
                  {calculateCompositeScore(chunks)}
                  <span className="text-base text-editorial-muted ml-1 font-sans">/100</span>
                </div>
                <div className="text-[8px] text-center uppercase font-bold tracking-[4px] text-editorial-muted">
                  Composite Index
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
                      className="flex items-start gap-2 bg-red-50 border border-red-200 p-3 text-red-700"
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span className="text-[10px] font-mono">
                        {c.judgeResult.error || 'Audit failed'}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Issues */}
            <div className="space-y-4">
              <label className="block text-[9px] font-bold uppercase tracking-[2px] text-editorial-muted border-b border-editorial-border pb-1">
                Anomalies Detected
              </label>
              <ul className="divide-y divide-editorial-border/50">
                {chunks
                  .flatMap((c) => c.judgeResult.issues)
                  .map((issue, i) => (
                    <li key={i} className="py-4 hover:bg-white/30 px-2 -mx-2 transition-colors rounded-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                            issue.severity === 'high' ? 'bg-red-500 text-white' : 'bg-editorial-ink text-white'
                          }`}
                        >
                          {issue.type}
                        </span>
                      </div>
                      <span className="font-display italic text-sm leading-snug block text-editorial-ink">
                        &quot;{issue.description}&quot;
                      </span>
                      {issue.suggestedFix && (
                        <div className="mt-2 text-[10px] font-mono text-editorial-muted bg-white p-2 rounded-sm border-l-2 border-editorial-accent">
                          FIX: {issue.suggestedFix}
                        </div>
                      )}
                    </li>
                  ))}
                {allClear && (
                  <div className="text-center py-20 opacity-20 italic font-display flex flex-col items-center gap-4">
                    <ShieldCheck size={40} strokeWidth={1} />
                    <span className="text-[10px] uppercase tracking-widest">Pipeline Audit Clear</span>
                  </div>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-10 font-display text-center px-6">
            <ShieldCheck size={48} strokeWidth={1} />
            <span className="text-[10px] uppercase tracking-[4px] font-bold mt-4">No Audit Record</span>
          </div>
        )}
      </div>

      <div className="mt-auto space-y-4">
        <button
          onClick={onRunAuditOnly}
          disabled={isProcessing || chunks.length === 0}
          className="w-full bg-transparent border border-editorial-ink text-editorial-ink px-4 py-4 text-[11px] font-bold uppercase tracking-[3px] hover:bg-editorial-ink hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm active:translate-y-px"
        >
          <RefreshCcw size={14} className={isProcessing ? 'animate-spin' : ''} /> Re-Evaluate Drafts
        </button>
        <button
          onClick={clearChunks}
          className="w-full border border-editorial-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center gap-2"
        >
          Clear Stream
        </button>
      </div>
    </section>
  );
}
