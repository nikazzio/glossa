import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStatusBarData } from '../../hooks/useStatusBarData';

const AREA_KEY: Record<string, string> = {
  translations: 'statusBar.areaTranslations',
  library: 'statusBar.areaLibrary',
  transcriptions: 'statusBar.areaTranscriptions',
};

function SaveIndicator({ state }: { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' }) {
  const { t } = useTranslation();

  if (state === 'idle') return null;

  if (state === 'saving') {
    return (
      <span title={t('statusBar.saving')} className="flex items-center gap-1 text-editorial-muted">
        <Loader2 size={10} className="animate-spin" />
        <span className="text-[11px]">{t('statusBar.saving')}</span>
      </span>
    );
  }

  const dot =
    state === 'saved'
      ? 'bg-editorial-success'
      : state === 'dirty'
        ? 'bg-editorial-warning'
        : 'bg-editorial-accent';

  const label =
    state === 'saved'
      ? t('statusBar.saved')
      : state === 'dirty'
        ? t('statusBar.dirty')
        : t('statusBar.saveError');

  return (
    <span title={label} className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className="text-[11px] text-editorial-muted">{label}</span>
    </span>
  );
}

export function AppStatusBar() {
  const { t } = useTranslation();
  const data = useStatusBarData();

  if (data.kind === 'idle') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-editorial-border/60 bg-editorial-bg px-4 text-[11px] text-editorial-muted"
    >
      {/* Left: context breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {data.kind === 'workspace' && (
          <>
            <span className="truncate font-medium text-editorial-ink">{data.workspaceName}</span>
            {data.areaName ? (
              <>
                <span className="text-editorial-border">/</span>
                <span className="truncate">{t(AREA_KEY[data.areaName] ?? data.areaName)}</span>
              </>
            ) : (
              <span className="text-editorial-border">·</span>
            )}
            <span>{t('workspace.projectsMetric', { count: data.projectCount })}</span>
          </>
        )}
        {data.kind === 'project' && (
          <>
            <span className="truncate font-medium text-editorial-ink">{data.projectName}</span>
            {data.pipelineName ? (
              <>
                <span className="text-editorial-border">/</span>
                <span className="truncate">{data.pipelineName}</span>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Center: stats (project only) */}
      {data.kind === 'project' && (
        <div className="hidden items-center gap-3 sm:flex">
          {data.runStatus === 'running' ? (
            <span className="flex items-center gap-1.5 text-editorial-warning">
              <Loader2 size={10} className="animate-spin" />
              {t('statusBar.running')} {data.completedChunks}/{data.totalChunks} {t('statusBar.chunks')}
            </span>
          ) : data.totalChunks > 0 ? (
            <>
              <span>{data.sourceWords.toLocaleString()} {t('statusBar.sourceWords')}</span>
              <span className="text-editorial-border">·</span>
              <span>{data.targetWords.toLocaleString()} {t('statusBar.targetWords')}</span>
              <span className="text-editorial-border">·</span>
              <span>{data.coverageRatio}% {t('statusBar.coverage')}</span>
              {data.runStatus === 'completed' && (
                <>
                  <span className="text-editorial-border">·</span>
                  <span className="text-editorial-success">{t('statusBar.completed')}</span>
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Right: save indicator (project only) */}
      <div className="shrink-0">
        {data.kind === 'project' && <SaveIndicator state={data.saveState} />}
      </div>
    </div>
  );
}
