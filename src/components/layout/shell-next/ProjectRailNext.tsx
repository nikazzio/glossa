import {
  ArrowLeft,
  ArrowLeftRight,
  FileOutput,
  LibraryBig,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  Upload,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
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
import { IconButton } from '../../ui';
import { ChunkInspectorPanel } from '../../document/InsightsDrawer';

export interface ProjectRailNextProps {
  collapsed: boolean;
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onReauditChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
  onOpenWorkspaceSettings?: () => void;
}

function PipelineNameSlot() {
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
    <div className="flex items-center gap-2 px-4 py-3">
      <span className="min-w-0 flex-1 truncate font-display text-base italic text-editorial-ink">
        {activeName}
      </span>
      {pipelines.length > 0 && (
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
          <Popover.Trigger asChild>
            <IconButton
              size="sm"
              tone={popoverOpen ? 'accent' : 'muted'}
              title={t('pipeline.changePipeline')}
              ariaLabel={t('pipeline.changePipeline')}
              tooltipSide="right"
              className="h-6 w-6 shrink-0 p-0"
            >
              <ArrowLeftRight size={11} />
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
        {/* Top: espandi */}
        <div className="flex h-11 shrink-0 items-center justify-center border-b border-editorial-border">
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setProjectContextCollapsed(false)}
            title={t('sidebar.expand')}
            tooltipSide="right"
          >
            <PanelLeftOpen size={14} />
          </IconButton>
        </div>

        {/* Contenuto: azione primaria */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 pt-4">
          <PipelineSidebarRunSection
            collapsed
            onRunPipeline={onRunPipeline}
            onCancelPipeline={onCancelPipeline}
            onRetranslateChunk={onRetranslateChunk}
            showAuditOnly={false}
            playFirst
          />
        </div>

        {/* Bottom: colonna icone */}
        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-editorial-border py-2">
          <IconButton
            size="md"
            tone="muted"
            onClick={() => closeProject()}
            disabled={isProcessing}
            title={t('sidebar.backToWorkspace')}
            tooltipSide="right"
          >
            <ArrowLeft size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowLibraryPanel(true)}
            title={t('library.openLibrary')}
            tooltipSide="right"
          >
            <LibraryBig size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowConfigDrawer(true)}
            title={t('pipeline.configurePipeline')}
            tooltipSide="right"
          >
            <Settings2 size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={onImportDocument}
            disabled={!onImportDocument || hasDocument}
            title={t('files.import')}
            tooltipSide="right"
          >
            <Upload size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowExportDialog(true)}
            disabled={!hasDocument}
            title={t('header.exportLabel')}
            tooltipSide="right"
          >
            <FileOutput size={14} />
          </IconButton>
        </div>

        <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: solo pulsante collassa, nessun separatore */}
      <div className="flex h-11 shrink-0 items-center px-3">
        <IconButton
          size="md"
          tone="muted"
          onClick={() => setProjectContextCollapsed(true)}
          title={t('sidebar.collapse')}
          tooltipSide="bottom"
        >
          <PanelLeftClose size={14} />
        </IconButton>
      </div>

      {/* Contenuto scrollabile */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden">
        <div className="flex flex-col">
          {/* Nome pipeline + cambia */}
          <PipelineNameSlot />

          {/* Run section */}
          <div className="py-3">
            <PipelineSidebarRunSection
              collapsed={false}
              onRunPipeline={onRunPipeline}
              onCancelPipeline={onCancelPipeline}
              onRetranslateChunk={onRetranslateChunk}
              showAuditOnly={false}
              playFirst
            />
          </div>

          {/* ChunkInspector embedded */}
          {onReauditChunk && <ChunkInspectorPanel onReauditChunk={onReauditChunk} />}
        </div>
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
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowLibraryPanel(true)}
            title={t('library.openLibrary')}
            tooltipSide="top"
          >
            <LibraryBig size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowConfigDrawer(true)}
            title={t('pipeline.configurePipeline')}
            tooltipSide="top"
          >
            <Settings2 size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={onImportDocument}
            disabled={!onImportDocument || hasDocument}
            title={t('files.import')}
            tooltipSide="top"
          >
            <Upload size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowExportDialog(true)}
            disabled={!hasDocument}
            title={t('header.exportLabel')}
            ariaLabel={t('header.exportLabel')}
            tooltipSide="top"
          >
            <FileOutput size={14} />
          </IconButton>
        </div>
      </div>

      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}
