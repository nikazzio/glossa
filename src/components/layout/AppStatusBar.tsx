import { CheckCircle2, AlertCircle, Highlighter, MinusCircle, Columns2, Link2, Link2Off, Loader2, NotebookText, PanelLeft, PanelRight, ShieldAlert, Terminal } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatusBarData } from '../../hooks/useStatusBarData';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { IconButton, Tooltip } from '../ui';
import { countWords, qualityLabelKey, qualityTone } from '../../utils';
import { OperationsTab } from '../document/OperationsTab';

const AREA_KEY: Record<string, string> = {
  translations: 'statusBar.areaTranslations',
  library: 'statusBar.areaLibrary',
  transcriptions: 'statusBar.areaTranscriptions',
};

const QUALITY_ICON = {
  strong: <CheckCircle2 size={11} className="text-editorial-success" />,
  ok: <MinusCircle size={11} className="text-editorial-warning" />,
  weak: <AlertCircle size={11} className="text-editorial-danger" />,
};

function SaveIndicator({ state }: { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' }) {
  const { t } = useTranslation();

  if (state === 'idle') return null;

  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-editorial-muted">
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
        : 'bg-editorial-danger';

  const label =
    state === 'saved'
      ? t('statusBar.saved')
      : state === 'dirty'
        ? t('statusBar.dirty')
        : t('statusBar.saveError');

  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className="text-xs text-editorial-muted">{label}</span>
    </span>
  );
}

function ConsoleDrawer() {
  const chunks = useChunksStore((s) => s.chunks);
  const selectedChunkId = useUiStore((s) => s.selectedChunkId);
  const setShowConsoleDrawer = useUiStore((s) => s.setShowConsoleDrawer);
  const setSelectedChunkId = useUiStore((s) => s.setSelectedChunkId);
  const height = useUiStore((s) => s.consoleDrawerHeight);
  const setHeight = useUiStore((s) => s.setConsoleDrawerHeight);

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onGripPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: event.clientY, startHeight: height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onGripPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setHeight(dragRef.current.startHeight + (dragRef.current.startY - event.clientY));
  };
  const onGripPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 flex flex-col border-t border-terminal-border bg-terminal-bg shadow-lg"
      style={{ height }}
    >
      {/* Maniglia di resize: trascina per cambiare l'altezza, persistita in uiStore. */}
      <div
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerUp}
        className="group flex h-2.5 shrink-0 cursor-ns-resize items-center justify-center bg-terminal-chrome"
      >
        <span className="h-[3px] w-8 rounded-full bg-terminal-dim transition-colors group-hover:bg-terminal-accent" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <OperationsTab
          panelId="console-drawer-panel"
          labelledBy="console-drawer-label"
          currentChunkId={selectedChunkId}
          chunks={chunks}
          onSelectChunk={setSelectedChunkId}
          onClose={() => setShowConsoleDrawer(false)}
        />
      </div>
    </div>
  );
}

function ChunkCenterStats() {
  const { t } = useTranslation();
  const chunks = useChunksStore((s) => s.chunks);
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const selectedChunkId = useUiStore((s) => s.selectedChunkId);
  const annotationsByChunkId = useAnnotationsStore((s) => s.annotationsByChunkId);

  const chunk = chunks.find((c) => c.id === selectedChunkId) ?? chunks[0] ?? null;
  const chunkIndex = chunk ? chunks.findIndex((c) => c.id === chunk.id) : -1;

  if (!chunk || chunkIndex < 0) return null;

  const wordCount = countWords(chunk.originalText ?? '');
  const chunkNum = chunkIndex + 1;
  const processing = isProcessing && chunk.status === 'processing';

  if (processing) {
    return (
      <span className="flex items-center gap-1.5 text-editorial-warning">
        <span className="font-display italic">§ {chunkNum}</span>
        <span className="text-editorial-border">·</span>
        <Loader2 size={10} className="animate-spin" />
        <span>{t('statusBar.chunkProcessing')}</span>
      </span>
    );
  }

  const tone = qualityTone(chunk.judgeResult?.rating ?? null);
  const qualityIcon = QUALITY_ICON[tone];
  const statusLabel = chunk.status === 'completed'
    ? t('statusBar.completed')
    : chunk.status === 'error'
      ? t('statusBar.error')
      : null;
  const issueCount = chunk.judgeResult?.status === 'completed' ? chunk.judgeResult.issues.length : 0;
  const noteCount = annotationsByChunkId.get(chunk.id)?.length ?? 0;

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-display italic">§ {chunkNum}</span>
      <span className="text-editorial-border">·</span>
      <Tooltip label={t('statusBar.chunkWordsTooltip', { count: wordCount.toLocaleString() })} side="top">
        <span>{wordCount.toLocaleString()} {t('statusBar.chunkWords')}</span>
      </Tooltip>
      {chunk.judgeResult?.status === 'completed' && (
        <>
          <span className="text-editorial-border">·</span>
          <Tooltip label={`${t('statusBar.quality.tooltipPrefix')} ${t(qualityLabelKey(chunk.judgeResult.rating)).toLowerCase()}`} side="top">
            <span className="flex items-center">{qualityIcon}</span>
          </Tooltip>
        </>
      )}
      {statusLabel && (
        <>
          <span className="text-editorial-border">·</span>
          <span className={chunk.status === 'completed' ? 'text-editorial-success' : 'text-editorial-danger'}>
            {statusLabel}
          </span>
        </>
      )}
      {issueCount > 0 && (
        <>
          <span className="text-editorial-border">·</span>
          <Tooltip label={t('audit.issuesCount', { count: issueCount })} side="top">
            <span className="flex items-center gap-1 text-editorial-danger">
              <ShieldAlert size={11} />
              {issueCount}
            </span>
          </Tooltip>
        </>
      )}
      {noteCount > 0 && (
        <>
          <span className="text-editorial-border">·</span>
          <Tooltip label={t('annotations.badgeCount', { count: noteCount })} side="top">
            <span className="flex items-center gap-1">
              <NotebookText size={11} />
              {noteCount}
            </span>
          </Tooltip>
        </>
      )}
    </span>
  );
}

export function AppStatusBar() {
  const { t } = useTranslation();
  const data = useStatusBarData();
  const syncScrollEnabled = useUiStore((state) => state.syncScrollEnabled);
  const setSyncScrollEnabled = useUiStore((state) => state.setSyncScrollEnabled);
  const documentPaneFocus = useUiStore((state) => state.documentPaneFocus);
  const setDocumentPaneFocus = useUiStore((state) => state.setDocumentPaneFocus);
  const showConsoleDrawer = useUiStore((state) => state.showConsoleDrawer);
  const setShowConsoleDrawer = useUiStore((state) => state.setShowConsoleDrawer);
  const highlightsEnabled = useUiStore((state) => state.highlightsEnabled);
  const setHighlightsEnabled = useUiStore((state) => state.setHighlightsEnabled);
  const hasGlossary = usePipelineStore((state) => state.config.glossary.length > 0);

  if (data.kind === 'idle') return null;

  const showPaneControls = data.kind === 'project' && data.totalChunks > 0;
  const syncDisabled = documentPaneFocus !== 'both';
  const syncOn = syncScrollEnabled && !syncDisabled;

  return (
    <div className="relative shrink-0">
      {showConsoleDrawer && data.kind === 'project' && <ConsoleDrawer />}
      <div
        role="status"
        aria-live="polite"
        className="flex h-8 items-center justify-between gap-4 border-t border-editorial-border/60 bg-editorial-bg px-4 text-xs text-editorial-muted"
      >
        {/* Left: pannello attivo */}
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
          {data.kind === 'project' && data.activePanel && (
            <span className="text-editorial-accent">
              {t(`statusBar.panel.${data.activePanel}`)}
            </span>
          )}
        </div>

        {/* Center: stats chunk corrente */}
        {data.kind === 'project' && data.totalChunks > 0 && (
          <div className="hidden items-center sm:flex">
            <ChunkCenterStats />
          </div>
        )}

        {/* Right: console toggle + controlli vista + salvataggio */}
        <div className="flex shrink-0 items-center gap-2">
          {data.kind === 'project' && (
            <IconButton
              size="xs"
              tone={showConsoleDrawer ? 'accent' : 'default'}
              onClick={() => setShowConsoleDrawer(!showConsoleDrawer)}
              title={t('console.toggle')}
              ariaPressed={showConsoleDrawer}
              tooltipSide="top"
            >
              <Terminal size={11} />
            </IconButton>
          )}
          {showPaneControls ? (
            <>
              <span className="h-3.5 w-px bg-editorial-border/60" aria-hidden="true" />
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
                {hasGlossary && (
                  <>
                    <span className="mx-0.5 h-3.5 w-px bg-editorial-border/60" aria-hidden="true" />
                    <IconButton
                      size="xs"
                      tone={highlightsEnabled ? 'accent' : 'default'}
                      onClick={() => setHighlightsEnabled(!highlightsEnabled)}
                      title={t('library.glossaryHighlightToggle')}
                      ariaPressed={highlightsEnabled}
                      tooltipSide="top"
                    >
                      <Highlighter size={11} />
                    </IconButton>
                  </>
                )}
              </div>
            </>
          ) : null}
          {data.kind === 'project' && (
            <>
              <span className="h-3.5 w-px bg-editorial-border/60" aria-hidden="true" />
              <SaveIndicator state={data.saveState} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
