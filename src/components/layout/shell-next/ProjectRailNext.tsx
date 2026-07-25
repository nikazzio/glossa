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
  Upload,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PipelineSidebarExportDialogHost,
  PipelineSidebarRunSection,
} from '../PipelineSidebarSections';
import { useUiStore } from '../../../stores/uiStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChunksStore } from '../../../stores/chunksStore';
import { useLibraryStore } from '../../../stores/libraryStore';
import { useConfigStore } from '../../../stores/configStore';
import { indexPad } from '../../../utils';
import { IconButton } from '../../ui';
import { ChunkInspectorPanel } from '../../document/InsightsDrawer';
import { RailBrandToggle } from './RailBrandToggle';

export interface ProjectRailNextProps {
  collapsed: boolean;
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onReauditChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
}

function PipelineNameSlot({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const pipelines = useProjectStore((s) => s.pipelines);
  const switchPipeline = useProjectStore((s) => s.switchPipeline);
  const createNewPipeline = useProjectStore((s) => s.createNewPipeline);
  const hasProject = useProjectStore((s) => !!s.currentProjectId);
  const maxPipelines = useConfigStore((s) => s.maxPipelines);

  const activeName =
    pipelines.find((p) => p.id === activePipelineId)?.name ??
    t('pipeline.pipelineNumber', { number: 1 });

  return (
    <div className="border-b border-editorial-border/70 px-4 pt-5 pb-4">
      <span className="block min-w-0 truncate font-display text-2xl italic leading-tight text-editorial-ink">
        {activeName}
      </span>
      <div className="mt-6 flex min-w-0 items-center justify-between gap-3">
        <ChunkRailNavigator collapsed={false} />
        {pipelines.length > 0 && (
          <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
              <IconButton
                size="md"
                tone={popoverOpen ? 'accent' : 'default'}
                title={t('pipeline.changePipeline')}
                ariaLabel={t('pipeline.changePipeline')}
                tooltipSide="right"
                className={`h-9 w-9 shrink-0 ${popoverOpen ? '' : 'bg-editorial-bg'}`}
              >
                <ArrowLeftRight size={14} />
              </IconButton>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="right"
                align="start"
                sideOffset={6}
                className="z-[150] min-w-40 overflow-hidden rounded-xl border border-editorial-border bg-editorial-bg shadow-lg"
              >
                {pipelines.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    onClick={() => {
                      void switchPipeline(pipeline.id);
                      setPopoverOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-editorial-textbox/60 ${
                      pipeline.id === activePipelineId
                        ? 'font-medium text-editorial-ink'
                        : 'text-editorial-muted'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        pipeline.id === activePipelineId
                          ? 'bg-editorial-success'
                          : 'bg-editorial-border'
                      }`}
                    />
                    <span className="truncate">{pipeline.name}</span>
                  </button>
                ))}
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
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
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

  if (collapsed) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center">
        {/* Top: marchio; il comando di espansione appare all'hover. */}
        <div className="flex h-20 w-full shrink-0 items-center justify-center">
          <RailBrandToggle
            onExpand={() => setProjectContextCollapsed(false)}
            title={t('sidebar.expand')}
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
