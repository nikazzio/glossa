import { useTranslation } from 'react-i18next';
import { AlertTriangle, Play, RotateCcw, X } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipeline } from '../../hooks/usePipeline';
import { buildPipelineFingerprint } from '../../utils/pipelineFingerprint';
import { usePipelineStore } from '../../stores/pipelineStore';

export function RunResumeBanner() {
  const { t } = useTranslation();
  const runInterrupted = useProjectStore((s) => s.runInterrupted);
  const lastRunConfig = useProjectStore((s) => s.lastRunConfig);
  const clearResumeState = useProjectStore((s) => s.clearResumeState);
  const chunks = useChunksStore((s) => s.chunks);
  const config = usePipelineStore((s) => s.config);
  const { runPipeline } = usePipeline();
  const resetAllChunks = useChunksStore((s) => s.resetAllChunks);

  if (!runInterrupted) return null;

  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const totalCount = chunks.length;

  const currentFingerprint = buildPipelineFingerprint(config);
  const configChanged = lastRunConfig !== null && lastRunConfig !== currentFingerprint;

  const handleResume = () => {
    clearResumeState();
    void runPipeline();
  };

  const handleRestart = () => {
    clearResumeState();
    resetAllChunks();
    void runPipeline();
  };

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
    >
      <div className="bg-editorial-paper border border-editorial-border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-editorial-ink">
              {t('resume.title')}
            </p>
            <p className="text-xs text-editorial-muted mt-0.5">
              {t('resume.progress', { completed: completedCount, total: totalCount })}
            </p>
            {configChanged && (
              <p className="text-xs text-amber-600 mt-1">
                {t('resume.configChanged')}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleResume}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-editorial-ink text-editorial-paper rounded hover:opacity-90 transition-opacity"
              >
                <Play size={12} />
                {t('resume.resumeButton')}
              </button>
              <button
                onClick={handleRestart}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-editorial-border text-editorial-ink rounded hover:bg-editorial-muted/10 transition-colors"
              >
                <RotateCcw size={12} />
                {t('resume.restartButton')}
              </button>
            </div>
          </div>
          <button
            onClick={() => clearResumeState()}
            aria-label={t('resume.dismiss')}
            className="shrink-0 text-editorial-muted hover:text-editorial-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
