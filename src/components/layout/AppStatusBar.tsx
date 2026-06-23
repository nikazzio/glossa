import { Columns2, Link2, Link2Off, Loader2, PanelLeft, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStatusBarData } from '../../hooks/useStatusBarData';
import { useUiStore } from '../../stores/uiStore';
import { IconButton, Tooltip } from '../ui';

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
        <span className="text-xs">{t('statusBar.saving')}</span>
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
      <span className="text-xs text-editorial-muted">{label}</span>
    </span>
  );
}

export function AppStatusBar() {
  const { t } = useTranslation();
  const data = useStatusBarData();
  // Shell nuova (#291): lo scorrimento agganciato — quasi sempre attivo — vive qui
  // come interruttore discreto, non più nella barra alto del documento.
  const syncScrollEnabled = useUiStore((state) => state.syncScrollEnabled);
  const setSyncScrollEnabled = useUiStore((state) => state.setSyncScrollEnabled);
  const documentPaneFocus = useUiStore((state) => state.documentPaneFocus);
  const setDocumentPaneFocus = useUiStore((state) => state.setDocumentPaneFocus);

  if (data.kind === 'idle') return null;

  // I controlli di vista del documento (fuoco pannelli + scroll agganciato) sono una
  // pulsantiera icone qui in basso, non nella barra alto del documento.
  const showPaneControls = data.kind === 'project' && data.totalChunks > 0;
  const syncDisabled = documentPaneFocus !== 'both';
  const syncOn = syncScrollEnabled && !syncDisabled;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-editorial-border/60 bg-editorial-bg px-4 text-xs text-editorial-muted"
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
            {data.activePanel ? (
              <>
                <span className="text-editorial-border">·</span>
                <span className="text-editorial-accent">
                  {t(`statusBar.panel.${data.activePanel}`)}
                  {data.panelSubTab ? ` / ${t(`statusBar.panelTab.${data.panelSubTab}`)}` : ''}
                </span>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Center: stats (project only) */}
      {data.kind === 'project' && (
        <div className="hidden items-center gap-3 sm:flex">
          {data.runStatus === 'running' ? (
            <Tooltip label={t('statusBar.tooltip.chunksProgress')} side="top">
              <span className="flex items-center gap-1.5 text-editorial-warning">
                <Loader2 size={10} className="animate-spin" />
                {t('statusBar.running')} {data.completedChunks}/{data.totalChunks} {t('statusBar.chunks')}
              </span>
            </Tooltip>
          ) : data.totalChunks > 0 ? (
            <>
              <Tooltip label={t('statusBar.tooltip.sourceWords')} side="top">
                <span>{data.sourceWords.toLocaleString()} {t('statusBar.sourceWords')}</span>
              </Tooltip>
              <span className="text-editorial-border">·</span>
              <Tooltip label={t('statusBar.tooltip.targetWords')} side="top">
                <span>{data.targetWords.toLocaleString()} {t('statusBar.targetWords')}</span>
              </Tooltip>
              <span className="text-editorial-border">·</span>
              <Tooltip label={t('statusBar.tooltip.coverage')} side="top">
                <span>{data.coveragePct}% {t('statusBar.coverage')}</span>
              </Tooltip>
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

      {/* Right: controlli di vista documento (shell nuova) + indicatore salvataggio */}
      <div className="flex shrink-0 items-center gap-2">
        {showPaneControls ? (
          <>
            <div className="flex items-center gap-1">
              <IconButton
                size="xs"
                tone={documentPaneFocus === 'both' ? 'accent' : 'default'}
                onClick={() => setDocumentPaneFocus('both')}
                title={t('document.focusBoth')}
                ariaPressed={documentPaneFocus === 'both'}
                tooltipSide="top"
              >
                <Columns2 size={11} />
              </IconButton>
              <IconButton
                size="xs"
                tone={documentPaneFocus === 'source' ? 'accent' : 'default'}
                onClick={() => setDocumentPaneFocus('source')}
                title={t('document.focusSource')}
                ariaPressed={documentPaneFocus === 'source'}
                tooltipSide="top"
              >
                <PanelLeft size={11} />
              </IconButton>
              <IconButton
                size="xs"
                tone={documentPaneFocus === 'translation' ? 'accent' : 'default'}
                onClick={() => setDocumentPaneFocus('translation')}
                title={t('document.focusTranslation')}
                ariaPressed={documentPaneFocus === 'translation'}
                tooltipSide="top"
              >
                <PanelRight size={11} />
              </IconButton>
              <span className="mx-0.5 h-3.5 w-px bg-editorial-border/60" aria-hidden="true" />
              <IconButton
                size="xs"
                tone={syncOn ? 'accent' : 'default'}
                onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
                disabled={syncDisabled}
                title={syncOn ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')}
                ariaPressed={syncOn}
                tooltipSide="top"
              >
                {syncOn ? <Link2 size={11} /> : <Link2Off size={11} />}
              </IconButton>
            </div>
            {data.kind === 'project' && (
              <span className="h-3.5 w-px bg-editorial-border/60" aria-hidden="true" />
            )}
          </>
        ) : null}
        {data.kind === 'project' && <SaveIndicator state={data.saveState} />}
      </div>
    </div>
  );
}
