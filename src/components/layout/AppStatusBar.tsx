import { CheckCircle2, AlertCircle, Highlighter, ListChecks, MinusCircle, Columns2, Link2, Link2Off, Loader2, NotebookText, PanelLeft, PanelRight, Search, ShieldAlert, Terminal, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatusBarData } from '../../hooks/useStatusBarData';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { useDiscoverySearchStore } from '../../stores/discoverySearchStore';
import { IconButton, Spinner, Tooltip } from '../ui';
import { countWords, qualityLabelKey, qualityTone } from '../../utils';
import { OperationsTab } from '../document/OperationsTab';
import { JobsIndicator } from '../jobs/JobsIndicator';
import { TerminalIconButton } from '../jobs/TerminalIconButton';
import { JobsPanel } from '../jobs/JobsPanel';

const AREA_KEY: Record<string, string> = {
  translations: 'statusBar.areaTranslations',
  library: 'statusBar.areaLibrary',
  transcriptions: 'statusBar.areaTranscriptions',
  analysis: 'statusBar.areaAnalysis',
};

const QUALITY_ICON = {
  strong: <CheckCircle2 size={11} className="text-editorial-success" />,
  ok: <MinusCircle size={11} className="text-editorial-warning" />,
  weak: <AlertCircle size={11} className="text-editorial-danger" />,
};

function SaveIndicator({ state, lastSavedAt }: { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; lastSavedAt: number | null }) {
  const { t } = useTranslation();

  if (state === 'idle') return null;

  const tooltipLabel = lastSavedAt
    ? t('statusBar.lastSavedTooltip', { time: new Date(lastSavedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })
    : t('statusBar.neverSavedTooltip');

  if (state === 'saving') {
    return (
      <Tooltip label={tooltipLabel} side="top">
        <Spinner size={10} label={t('statusBar.saving')} className="flex items-center gap-1 text-xs text-editorial-muted" />
      </Tooltip>
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
    <Tooltip label={tooltipLabel} side="top">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-xs text-editorial-muted">{label}</span>
      </span>
    </Tooltip>
  );
}


/** Scheda del pannello in basso: stessa palette scura della console. */
function DrawerTab({
  children,
  label,
  id,
  controls,
  selected,
  onSelect,
}: {
  children: React.ReactNode;
  label: string;
  id: string;
  controls: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        id={id}
        role="tab"
        aria-selected={selected}
        aria-controls={controls}
        aria-label={label}
        onClick={onSelect}
        className={`flex h-6.5 w-6.5 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent ${
          selected
            ? 'border-terminal-accent/60 text-terminal-accent'
            : 'border-terminal-border text-terminal-secondary hover:border-terminal-accent/60 hover:text-terminal-accent'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Il pannello in basso (D20). Log e lavori sono schede della stessa area — le
 * due facce della domanda "cosa sta facendo il programma" — sul modello del
 * pannello di VS Code. Una destinazione sola: al passaggio del mouse un
 * riepilogo, al clic il pannello.
 */
function BottomDrawer({ showConsoleTab }: { showConsoleTab: boolean }) {
  const { t } = useTranslation();
  const chunks = useChunksStore((s) => s.chunks);
  const selectedChunkId = useUiStore((s) => s.selectedChunkId);
  const setShowConsoleDrawer = useUiStore((s) => s.setShowConsoleDrawer);
  const setSelectedChunkId = useUiStore((s) => s.setSelectedChunkId);
  const height = useUiStore((s) => s.consoleDrawerHeight);
  const setHeight = useUiStore((s) => s.setConsoleDrawerHeight);
  const drawerTab = useUiStore((s) => s.drawerTab);
  const setDrawerTab = useUiStore((s) => s.setDrawerTab);
  // Fuori da un progetto i messaggi della pipeline non esistono: resta la
  // scheda dei lavori, che invece vale ovunque.
  const activeTab = showConsoleTab ? drawerTab : 'jobs';

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onGripPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Senza preventDefault, trascinare la maniglia seleziona/deseleziona il
    // testo del documento sotto (comportamento nativo del browser per un
    // mousedown+drag, non collegato al ridimensionamento in sé).
    event.preventDefault();
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
      className="absolute bottom-full left-0 right-0 z-[150] flex flex-col border-t border-terminal-border bg-terminal-bg shadow-lg"
      style={{ height }}
    >
      {/* Maniglia di resize: trascina per cambiare l'altezza, persistita in uiStore. */}
      <div
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerUp}
        className="group flex h-2.5 shrink-0 cursor-ns-resize select-none items-center justify-center bg-terminal-chrome"
      >
        <span className="h-[3px] w-8 rounded-full bg-terminal-dim transition-colors group-hover:bg-terminal-accent" />
      </div>
      <div
        role="tablist"
        aria-label={t('jobs.drawerTabs')}
        className="flex shrink-0 items-center gap-1 border-b border-terminal-border bg-terminal-chrome px-2 py-1"
      >
        {showConsoleTab && (
          <DrawerTab
            label={t('console.toggle')}
            id="drawer-tab-console"
            controls="console-drawer-panel"
            selected={activeTab === 'console'}
            onSelect={() => setDrawerTab('console')}
          >
            <Terminal size={12} />
          </DrawerTab>
        )}
        <DrawerTab
          label={t('jobs.tab')}
          id="drawer-tab-jobs"
          controls="jobs-drawer-panel"
          selected={activeTab === 'jobs'}
          onSelect={() => setDrawerTab('jobs')}
        >
          <ListChecks size={12} />
        </DrawerTab>
        <div className="flex-1" />
        {/* Chiudere dev'essere possibile da qui: fuori da un progetto il
            comando in barra che ha aperto il pannello potrebbe non esserci. */}
        <TerminalIconButton label={t('common.close')} onClick={() => setShowConsoleDrawer(false)}>
          <X size={12} />
        </TerminalIconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'console' ? (
          <OperationsTab
            panelId="console-drawer-panel"
            labelledBy="console-drawer-label"
            currentChunkId={selectedChunkId}
            chunks={chunks}
            onSelectChunk={setSelectedChunkId}
          />
        ) : (
          <JobsPanel panelId="jobs-drawer-panel" labelledBy="drawer-tab-jobs" />
        )}
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

  const wordCount = countWords(chunk.sourceDisplayText);
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
  const issueCount = chunk.judgeResult?.status === 'completed'
    ? chunk.judgeResult.issues.filter((issue) => !issue.resolved && !issue.rejected).length
    : 0;
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

function DiscoveryCenterStats() {
  const { t } = useTranslation();
  const outcome = useDiscoverySearchStore((s) => s.outcome);

  if (!outcome || outcome.status === 'not_found') return null;

  if (outcome.manifest) {
    const pageCount = outcome.manifest.itemCount;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Search size={11} />
        <span className="min-w-0 truncate">{outcome.manifest.title}</span>
        {pageCount !== null && (
          <>
            <span className="text-editorial-border">·</span>
            <span>{t('statusBar.discoveryPages', { count: pageCount })}</span>
          </>
        )}
      </span>
    );
  }

  const count = outcome.results.length;
  if (count === 0) return null;

  return (
    <span className="flex items-center gap-1.5">
      <Search size={11} />
      <span>{t('statusBar.discoveryResults', { count })}</span>
      {outcome.hasMore && (
        <>
          <span className="text-editorial-border">·</span>
          <span>{t('statusBar.discoveryMore')}</span>
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
  const drawerTab = useUiStore((state) => state.drawerTab);
  const highlightsEnabled = useUiStore((state) => state.highlightsEnabled);
  const setHighlightsEnabled = useUiStore((state) => state.setHighlightsEnabled);
  const hasGlossary = usePipelineStore((state) => state.config.glossary.length > 0);

  if (data.kind === 'idle') return null;

  const showPaneControls = data.kind === 'project' && data.totalChunks > 0;
  const syncDisabled = documentPaneFocus !== 'both';
  const syncOn = syncScrollEnabled && !syncDisabled;

  return (
    <div className="relative shrink-0">
      {showConsoleDrawer && (data.kind === 'project' || drawerTab === 'jobs') && (
        <BottomDrawer showConsoleTab={data.kind === 'project'} />
      )}
      <div
        role="status"
        aria-live="polite"
        className="flex h-8 items-center justify-between gap-4 border-t border-editorial-border/60 bg-editorial-bg px-4 text-xs text-editorial-muted"
      >
        {/* Left: pannello attivo */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          {data.kind === 'workspace' &&
            (data.areaName === 'dashboard' ? (
              // La Dashboard è app-level: nessun prefisso workspace nel breadcrumb.
              <span className="truncate font-medium text-editorial-ink">{t('dashboard.title')}</span>
            ) : data.areaName === 'workspace' ? (
              <>
                <span className="truncate font-medium text-editorial-ink">{data.workspaceName}</span>
                <span>{t('workspace.projectsMetric', { count: data.projectCount })}</span>
              </>
            ) : (
              <>
                <span className="truncate font-medium text-editorial-ink">{data.workspaceName}</span>
                <span className="text-editorial-border">/</span>
                <span className="truncate">{t(AREA_KEY[data.areaName] ?? data.areaName)}</span>
                <span>{t('workspace.projectsMetric', { count: data.projectCount })}</span>
              </>
            ))}
          {data.kind === 'project' && data.activePanel && (
            <span className="text-editorial-accent">
              {t(`statusBar.panel.${data.activePanel}`)}
            </span>
          )}
        </div>

        {/* Center: stats chunk corrente / risultati discovery in dashboard */}
        {data.kind === 'project' && data.totalChunks > 0 && (
          <div className="hidden items-center sm:flex">
            <ChunkCenterStats />
          </div>
        )}
        {data.kind === 'workspace' && data.areaName === 'dashboard' && (
          <div className="hidden min-w-0 items-center sm:flex">
            <DiscoveryCenterStats />
          </div>
        )}

        {/* Right: lavori + console + controlli vista + salvataggio.
            L'indicatore dei lavori sta **sempre qui**, nella stessa posizione in
            ogni sezione: cambia cosa mostra, non dove sta. Accanto al comando
            della console perché aprono lo stesso pannello. */}
        <div className="flex shrink-0 items-center gap-2">
          <JobsIndicator />
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
              <SaveIndicator state={data.saveState} lastSavedAt={data.lastSavedAt} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
