import { CheckCircle2, AlertCircle, ListChecks, MinusCircle, Loader2, NotebookText, PanelBottom, Search, ShieldAlert, Terminal, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatusBarData } from '../../hooks/useStatusBarData';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { getWorkspaceFilter } from '../../navigation/appLocation';
import { useUiStore } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { useDiscoverySearchStore } from '../../stores/discoverySearchStore';
import { IconButton, Spinner, Tooltip } from '../ui';
import { countWords, qualityLabelKey, qualityTone } from '../../utils';
import { OperationsTab } from '../document/OperationsTab';
import { JobsIndicator } from '../jobs/JobsIndicator';
import { TerminalIconButton } from '../jobs/TerminalIconButton';
import { JobsPanel } from '../jobs/JobsPanel';
import { JobsBulkControls } from '../jobs/JobsBulkControls';

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
    ? t('statusBar.lastSavedTooltip', {
        // Sempre su 24 ore, come nel pannello dei lavori.
        time: new Date(lastSavedAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      })
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
 * Il pannello in basso. Log e lavori sono schede della stessa area — le
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
        {activeTab === 'jobs' && <JobsBulkControls />}
        {/* Separato dai comandi dei lavori: chiudere il pannello per sbaglio
            mentre si voleva mettere in pausa sarebbe fastidioso. */}
        <span className="mx-1.5 h-4 w-px bg-terminal-border" aria-hidden="true" />
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


/**
 * Dove sono. Prima zona della barra, **sempre compilata**.
 *
 * Segue il contratto di navigazione di `PRODUCT_ARCHITECTURE_2_0.md` §6:
 * posizione e workspace sono concetti **distinti**. Le aree — Biblioteca,
 * Traduzioni, Trascrizioni, Analisi — sono globali: aprire un workspace non le
 * trasforma in aree di quel workspace, applica al massimo un **filtro visibile
 * e rimovibile**. Scrivere «Default / Biblioteca» direbbe quindi una cosa falsa
 * sul prodotto, oltre a leggersi male.
 *
 * Un solo trattamento visivo in tutte le sezioni: l'ultimo segmento in
 * evidenza, il resto smorzato. Niente verde: qui non c'è niente di attivo da
 * segnalare, e il verde è riservato a schede e stati attivi.
 */
function LocationLabel({ data }: { data: ReturnType<typeof useStatusBarData> }) {
  const { t } = useTranslation();
  const location = useUiStore((state) => state.location);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const filterId = getWorkspaceFilter(location);
  const filterName = filterId ? workspaces.find((w) => w.id === filterId)?.name : undefined;

  // Dentro un progetto la posizione è area → oggetto: qui il contenimento è
  // vero, il progetto sta davvero dentro Traduzioni.
  if (data.kind === 'project') {
    return (
      <>
        <span className={data.projectName ? 'truncate' : 'truncate font-medium text-editorial-ink'}>
          {t(AREA_KEY.translations)}
        </span>
        {/* Nessun separatore senza qualcosa da separare. */}
        {data.projectName && (
          <>
            <span className="text-editorial-border">/</span>
            <span className="truncate font-medium text-editorial-ink">{data.projectName}</span>
          </>
        )}
      </>
    );
  }

  if (location.area === 'dashboard') {
    return <span className="truncate font-medium text-editorial-ink">{t('dashboard.title')}</span>;
  }

  if (location.area === 'workspace') {
    return (
      <>
        <span className="truncate font-medium text-editorial-ink">
          {data.kind === 'workspace' ? data.workspaceName : ''}
        </span>
        {data.kind === 'workspace' && (
          <span>{t('workspace.projectsMetric', { count: data.projectCount })}</span>
        )}
      </>
    );
  }

  return (
    <>
      <span className="truncate font-medium text-editorial-ink">
        {t(AREA_KEY[location.area] ?? location.area)}
      </span>
      {filterName && (
        // Il filtro è un aggiunta all'area, non il suo contenitore.
        <span className="truncate">{t('statusBar.workspaceFilter', { name: filterName })}</span>
      )}
    </>
  );
}

export function AppStatusBar() {
  const { t } = useTranslation();
  const data = useStatusBarData();
  const showConsoleDrawer = useUiStore((state) => state.showConsoleDrawer);
  const setShowConsoleDrawer = useUiStore((state) => state.setShowConsoleDrawer);
  const drawerTab = useUiStore((state) => state.drawerTab);
  const setDrawerTab = useUiStore((state) => state.setDrawerTab);

  if (data.kind === 'idle') return null;

  return (
    <div className="relative shrink-0">
      {showConsoleDrawer && (data.kind === 'project' || drawerTab === 'jobs') && (
        <BottomDrawer showConsoleTab={data.kind === 'project'} />
      )}
      {/* Zone stabili: contesto, stato, comandi globali. */}
      <div
        role="status"
        aria-live="polite"
        className="grid h-8 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-editorial-border/60 bg-editorial-bg px-4 text-xs text-editorial-muted"
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <LocationLabel data={data} />
        </div>

        {/* 2 — Il contesto della schermata: l'unica zona che può restare
            vuota, perché non tutte le schermate hanno numeri da dire. */}
        <div className="hidden min-w-0 items-center justify-center sm:flex">
          {data.kind === 'project' && data.totalChunks > 0 && <ChunkCenterStats />}
          {data.kind === 'workspace' && data.areaName === 'dashboard' && <DiscoveryCenterStats />}
        </div>

        {/* 3 — Comandi e stato globali, ordine invariabile:
            lavori · pannello · controlli vista · salvataggio. */}
        <div className="flex shrink-0 items-center justify-end gap-2">
          <JobsIndicator />
          <IconButton
            size="xs"
            tone={showConsoleDrawer ? 'accent' : 'default'}
            onClick={() => {
              // Aprendolo da qui si va sui messaggi dove esistono — dentro una
              // traduzione — e sui lavori altrove, che è l'unica cosa che c'è.
              if (!showConsoleDrawer) setDrawerTab(data.kind === 'project' ? 'console' : 'jobs');
              setShowConsoleDrawer(!showConsoleDrawer);
            }}
            title={t('statusBar.panelToggle')}
            ariaPressed={showConsoleDrawer}
            tooltipSide="top"
          >
            <PanelBottom size={11} />
          </IconButton>
          {/* Lo spazio del salvataggio è riservato anche dove non c'è niente
              da salvare: senza, tutto il gruppo scivolerebbe a destra cambiando
              sezione. Generalizzarlo a trascrizioni e fonti è lavoro di #413. */}
          <span className="h-3.5 w-px bg-editorial-border/60" aria-hidden="true" />
          <div className="flex min-w-[5.5rem] justify-end">
            {data.kind === 'project' && (
              <SaveIndicator state={data.saveState} lastSavedAt={data.lastSavedAt} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
