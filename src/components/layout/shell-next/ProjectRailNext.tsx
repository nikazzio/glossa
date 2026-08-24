import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileOutput,
  LibraryBig,
  PanelLeftClose,
  Plus,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PipelineSidebarExportDialogHost,
  PipelineSidebarRunSection,
} from '../PipelineSidebarSections';
import { confirm } from '../../../stores/confirmStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { useUiStore } from '../../../stores/uiStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChunksStore } from '../../../stores/chunksStore';
import { useLibraryStore } from '../../../stores/libraryStore';
import { useConfigStore } from '../../../stores/configStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { indexPad } from '../../../utils';
import { ClickPopover, IconButton, Tooltip } from '../../ui';
import { ChunkInspectorPanel } from '../../document/InsightsDrawer';
import { RailBrandToggle } from './RailBrandToggle';
import { WorkspaceIcon } from '../../workspace/WorkspaceIdentity';

export interface ProjectRailNextProps {
  collapsed: boolean;
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onReauditChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
}


/**
 * Nome del progetto, rinominabile sul posto.
 *
 * Dentro una traduzione il progetto non compariva da nessuna parte se non nella
 * riga in testata, che è testo e basta: il nome si poteva dare alla creazione e
 * mai più correggere.
 */
function ProjectNameField() {
  const { t } = useTranslation();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectName = useProjectStore(
    (s) => s.projects.find((project) => project.id === s.currentProjectId)?.name ?? '',
  );
  const renameCurrentProject = useProjectStore((s) => s.renameCurrentProject);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);

  if (!currentProjectId) return null;

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== projectName) void renameCurrentProject(draft);
  };

  if (editing) {
    return (
      <input
        // Il campo compare solo dopo un clic esplicito sul nome: mettere a
        // fuoco quello che l'utente ha appena chiesto di modificare è il
        // comportamento atteso, non un dirottamento.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setDraft(projectName);
            setEditing(false);
          }
        }}
        aria-label={t('projects.rename')}
        className="w-full rounded border border-editorial-accent/50 bg-editorial-textbox px-1.5 py-0.5 font-display text-2xl italic leading-tight text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      />
    );
  }

  return (
    <Tooltip label={t('projects.rename')} side="right">
      <button
        type="button"
        onClick={() => {
          setDraft(projectName);
          setEditing(true);
        }}
        className="block w-full truncate text-left font-display text-2xl italic leading-tight text-editorial-accent transition-colors hover:text-editorial-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        {projectName || t('projects.untitled')}
      </button>
    </Tooltip>
  );
}

function PipelineNameSlot({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const pipelines = useProjectStore((s) => s.pipelines);
  const switchPipeline = useProjectStore((s) => s.switchPipeline);
  const createNewPipeline = useProjectStore((s) => s.createNewPipeline);
  const deletePipeline = useProjectStore((s) => s.deletePipeline);
  const hasProject = useProjectStore((s) => !!s.currentProjectId);
  const maxPipelines = useConfigStore((s) => s.maxPipelines);
  const isRunning = usePipelineStore((s) => s.runStatus === 'running');

  const activeName =
    pipelines.find((p) => p.id === activePipelineId)?.name ??
    t('pipeline.pipelineNumber', { number: 1 });

  const handleDeletePipeline = useCallback(async (pipelineId: string, pipelineName: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmDeleteTitle'),
      message: t('pipeline.confirmDeleteMessage', { name: pipelineName }),
      confirmLabel: t('pipeline.deletePipeline'),
      danger: true,
    });
    if (!ok) return;
    await deletePipeline(pipelineId);
  }, [deletePipeline, t]);

  return (
    <div className="border-b border-editorial-border/70 px-4 pt-5 pb-4">
      {/* Il progetto sta sopra la pipeline: è il contenitore, e finora non
          compariva da nessuna parte dentro la traduzione — solo in testata, dove
          non si poteva nemmeno rinominare. */}
      <ProjectNameField />
      <div className="mt-2.5 flex min-w-0 items-center justify-between gap-3">
        <span className="block min-w-0 truncate text-xs font-sans uppercase tracking-[0.14em] text-editorial-muted">
          {activeName}
        </span>
        {/* Il comando che cambia pipeline sta accanto al nome della pipeline:
            prima era una riga più in basso, accanto ai frammenti, e sembrava
            appartenere a quelli. */}
        {pipelines.length > 0 && (
          <ClickPopover
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            side="right"
            align="start"
            trigger={
              <IconButton
                size="sm"
                tone={popoverOpen ? 'accent' : 'default'}
                title={t('pipeline.changePipeline')}
                ariaLabel={t('pipeline.changePipeline')}
                ariaPressed={popoverOpen}
                tooltipSide="right"
                className={`h-7 w-7 shrink-0 ${popoverOpen ? '' : 'bg-editorial-bg'}`}
              >
                <ArrowLeftRight size={12} />
              </IconButton>
            }
          >
            {pipelines.map((pipeline) => {
              const isActive = pipeline.id === activePipelineId;
              const canDelete = pipelines.length > 1 && !(isActive && isRunning);
              return (
                <div
                  key={pipeline.id}
                  className="flex items-center gap-1 transition-colors hover:bg-editorial-textbox/60"
                >
                  <button
                    onClick={() => {
                      void switchPipeline(pipeline.id);
                      setPopoverOpen(false);
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm ${
                      isActive ? 'font-medium text-editorial-ink' : 'text-editorial-muted'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        isActive ? 'bg-editorial-success' : 'bg-editorial-border'
                      }`}
                    />
                    <span className="truncate">{pipeline.name}</span>
                  </button>
                  {canDelete && (
                    <IconButton
                      size="sm"
                      tone="muted"
                      onClick={() => void handleDeletePipeline(pipeline.id, pipeline.name)}
                      title={t('pipeline.deletePipeline')}
                      ariaLabel={t('pipeline.deletePipeline')}
                      className="mr-1 h-6 w-6 shrink-0 p-0"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </div>
              );
            })}
            {hasProject && pipelines.length < maxPipelines && (
              <>
                <div className="border-t border-editorial-border/60" />
                <button
                  onClick={() => {
                    void createNewPipeline(
                      t('pipeline.pipelineNumber', { number: pipelines.length + 1 }),
                    );
                    setPopoverOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-editorial-muted transition-colors hover:bg-editorial-textbox/60 hover:text-editorial-ink"
                >
                  <Plus size={12} />
                  {t('pipeline.newPipeline')}
                </button>
              </>
            )}
          </ClickPopover>
        )}
      </div>
      <div className="mt-5">
        <ChunkRailNavigator collapsed={false} />
      </div>
      {children ? <div className="mt-4 border-t border-editorial-border/50 pt-4">{children}</div> : null}
    </div>
  );
}

function ChunkRailNavigator({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const chunks = useChunksStore((state) => state.chunks);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);

  if (chunks.length === 0) return null;

  const currentIndex = Math.max(
    0,
    chunks.findIndex((chunk) => chunk.id === selectedChunkId),
  );
  const prevChunk = chunks[currentIndex - 1] ?? null;
  const nextChunk = chunks[currentIndex + 1] ?? null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-1 pb-3">
        <IconButton
          size="md"
          tone="default"
          onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
          title={t('document.previousChunk')}
          disabled={!prevChunk}
          tooltipSide="right"
          className="h-9 w-9 bg-editorial-bg"
        >
          <ChevronUp size={14} />
        </IconButton>
        <IconButton
          size="md"
          tone="default"
          onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
          title={t('document.nextChunk')}
          disabled={!nextChunk}
          tooltipSide="right"
          className="h-9 w-9 bg-editorial-bg"
        >
          <ChevronDown size={14} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-start">
      <div className="flex items-center gap-2">
        <IconButton
          size="md"
          tone="default"
          onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
          title={t('document.previousChunk')}
          disabled={!prevChunk}
          tooltipSide="bottom"
          className="h-9 w-9 bg-editorial-bg"
        >
          <ChevronLeft size={14} />
        </IconButton>
        <span className="shrink-0 font-display text-base italic leading-none text-editorial-ink tabular-nums">
          {indexPad(currentIndex + 1)}<span className="px-0.5 text-editorial-muted">/</span>{indexPad(chunks.length)}
        </span>
        <IconButton
          size="md"
          tone="default"
          onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
          title={t('document.nextChunk')}
          disabled={!nextChunk}
          tooltipSide="bottom"
          className="h-9 w-9 bg-editorial-bg"
        >
          <ChevronRight size={14} />
        </IconButton>
      </div>
    </div>
  );
}

interface RailBottomActionsProps {
  tooltipSide: 'right' | 'top';
  includeBack?: boolean;
  closeProject: () => void;
  isProcessing: boolean;
  setShowLibraryPanel: (show: boolean) => void;
  setShowConfigDrawer: (show: boolean) => void;
  onImportDocument?: () => void;
  hasDocument: boolean;
  setShowExportDialog: (show: boolean) => void;
}

function RailBottomActions({
  tooltipSide,
  includeBack,
  closeProject,
  isProcessing,
  setShowLibraryPanel,
  setShowConfigDrawer,
  onImportDocument,
  hasDocument,
  setShowExportDialog,
}: RailBottomActionsProps) {
  const { t } = useTranslation();
  return (
    <>
      {includeBack && (
        <IconButton
          size="md"
          tone="default"
          onClick={() => closeProject()}
          disabled={isProcessing}
          title={t('sidebar.backToWorkspace')}
          tooltipSide={tooltipSide}
          className="h-9 w-9 bg-editorial-bg"
        >
          <ArrowLeft size={14} />
        </IconButton>
      )}
      <IconButton
        size="md"
        tone="default"
        onClick={() => setShowLibraryPanel(true)}
        title={t('library.openLibrary')}
        tooltipSide={tooltipSide}
        className="h-9 w-9 bg-editorial-bg"
      >
        <LibraryBig size={14} />
      </IconButton>
      <IconButton
        size="md"
        tone="default"
        onClick={() => setShowConfigDrawer(true)}
        title={t('pipeline.configurePipeline')}
        tooltipSide={tooltipSide}
        className="h-9 w-9 bg-editorial-bg"
      >
        <Settings2 size={14} />
      </IconButton>
      <IconButton
        size="md"
        tone="default"
        onClick={onImportDocument}
        disabled={!onImportDocument || hasDocument}
        title={t('files.import')}
        tooltipSide={tooltipSide}
        className="h-9 w-9 bg-editorial-bg"
      >
        <Upload size={14} />
      </IconButton>
      <IconButton
        size="md"
        tone="default"
        onClick={() => setShowExportDialog(true)}
        disabled={!hasDocument}
        title={t('header.exportLabel')}
        tooltipSide={tooltipSide}
        className="h-9 w-9 bg-editorial-bg"
      >
        <FileOutput size={14} />
      </IconButton>
    </>
  );
}

export function ProjectRailNext({
  collapsed,
  onRunPipeline,
  onCancelPipeline,
  onRetranslateChunk,
  onReauditChunk,
  onImportDocument,
}: ProjectRailNextProps) {
  const { t } = useTranslation();
  const closeProject = useProjectStore((state) => state.closeProject);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const hasDocument = useChunksStore((state) => state.chunks.length > 0);
  const setShowLibraryPanel = useLibraryStore((state) => state.setShowLibraryPanel);
  const showExportDialog = useUiStore((state) => state.showExportDialog);
  const setShowExportDialog = useUiStore((state) => state.setShowExportDialog);
  const setProjectContextCollapsed = useUiStore((state) => state.setProjectContextCollapsed);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);

  if (collapsed) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center">
        {/* Top: marchio; il comando di espansione appare all'hover. */}
        <div className="flex h-20 w-full shrink-0 items-center justify-center">
          <RailBrandToggle
            onExpand={() => setProjectContextCollapsed(false)}
            title={t('sidebar.expand')}
            icon={activeWorkspace ? <WorkspaceIcon iconKey={activeWorkspace.iconKey} size={24} /> : undefined}
          />
        </div>

        {/* Contenuto: azione primaria */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 pt-4">
          <ChunkRailNavigator collapsed />
          <PipelineSidebarRunSection
            collapsed
            onRunPipeline={onRunPipeline}
            onCancelPipeline={onCancelPipeline}
            onRetranslateChunk={onRetranslateChunk}
          />
        </div>

        {/* Bottom: colonna icone */}
        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-editorial-border py-2">
          <RailBottomActions
            tooltipSide="right"
            includeBack
            closeProject={closeProject}
            isProcessing={isProcessing}
            setShowLibraryPanel={setShowLibraryPanel}
            setShowConfigDrawer={setShowConfigDrawer}
            onImportDocument={onImportDocument}
            hasDocument={hasDocument}
            setShowExportDialog={setShowExportDialog}
          />
        </div>

        <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: solo controllo della rail; titolo e navigazione hanno fasce dedicate sotto. */}
      <div className="flex h-20 shrink-0 items-center justify-end px-3">
        <IconButton
          size="md"
          tone="default"
          onClick={() => setProjectContextCollapsed(true)}
          title={t('sidebar.collapse')}
          tooltipSide="bottom"
          className="h-9 w-9 shrink-0 bg-editorial-bg"
        >
          <PanelLeftClose size={14} />
        </IconButton>
      </div>

      {/* Contenuto operativo: testata fissa + tab con contenuto scrollabile */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PipelineNameSlot>
          <PipelineSidebarRunSection
            collapsed={false}
            onRunPipeline={onRunPipeline}
            onCancelPipeline={onCancelPipeline}
            onRetranslateChunk={onRetranslateChunk}
          />
        </PipelineNameSlot>

        {onReauditChunk && <ChunkInspectorPanel onReauditChunk={onReauditChunk} />}
      </div>

      {/* Bottom: ArrowLeft sx, resto allineato dx */}
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-editorial-border px-2">
        <IconButton
          size="md"
          tone="muted"
          onClick={() => closeProject()}
          disabled={isProcessing}
          title={t('sidebar.backToWorkspace')}
          tooltipSide="top"
        >
          <ArrowLeft size={14} />
        </IconButton>
        <div className="flex items-center gap-1">
          <RailBottomActions
            tooltipSide="top"
            closeProject={closeProject}
            isProcessing={isProcessing}
            setShowLibraryPanel={setShowLibraryPanel}
            setShowConfigDrawer={setShowConfigDrawer}
            onImportDocument={onImportDocument}
            hasDocument={hasDocument}
            setShowExportDialog={setShowExportDialog}
          />
        </div>
      </div>

      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}
