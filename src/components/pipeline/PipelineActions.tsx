import { Loader2, Play, ScanLine, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChunksStore } from '../../stores/chunksStore';

interface PipelineActionsProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
  variant?: 'full' | 'compact';
}

export function PipelineActions({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  variant = 'full',
}: PipelineActionsProps) {
  const { t } = useTranslation();
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const cancelRequested = useChunksStore((state) => state.cancelRequested);

  const cannotRun = isProcessing || chunks.length === 0;
  const runReason = isProcessing
    ? t('pipeline.runDisabledProcessing')
    : chunks.length === 0
      ? t('pipeline.runDisabledNoChunks')
      : undefined;

  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <div
        role="toolbar"
        aria-label={t('pipeline.beginPipeline')}
        className="flex flex-wrap items-center gap-2"
      >
        {isProcessing ? (
          <button
            type="button"
            onClick={onCancelPipeline}
            disabled={cancelRequested}
            title={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
            aria-label={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
            className="flex items-center gap-2 rounded-full border border-editorial-accent px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-accent transition-colors hover:bg-editorial-accent/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Square size={12} fill="currentColor" />
            <span>{cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}</span>
            <Loader2 className="animate-spin" size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunPipeline}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.beginPipeline')}
            aria-label={t('pipeline.beginPipeline')}
            className="flex items-center gap-2 rounded-full bg-editorial-ink px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-editorial-ink/90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Play size={12} fill="currentColor" />
            <span>{t('pipeline.run')}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="toolbar" aria-label={t('pipeline.beginPipeline')} className="flex flex-col gap-3 shrink-0">
      <button
        type="button"
        onClick={onRunPipeline}
        disabled={cannotRun}
        title={runReason ?? t('pipeline.beginPipeline')}
        aria-label={t('pipeline.beginPipeline')}
        className="bg-editorial-ink text-white px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={14} />
            {t('pipeline.executing')}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Play size={14} fill="currentColor" /> {t('pipeline.beginPipeline')}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRunAuditOnly}
        disabled={cannotRun}
        title={runReason ?? t('pipeline.runAuditOnly')}
        aria-label={t('pipeline.runAuditOnly')}
        className="bg-transparent border border-editorial-ink text-editorial-ink px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
      >
        {t('pipeline.runAuditOnly')}
      </button>
      {isProcessing && (
        <button
          type="button"
          onClick={onCancelPipeline}
          disabled={cancelRequested}
          title={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
          aria-label={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
          className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
        >
          {cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
        </button>
      )}
    </div>
  );
}
