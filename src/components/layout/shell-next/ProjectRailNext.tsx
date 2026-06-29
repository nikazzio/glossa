import { ArrowLeft, ChevronLeft, ChevronRight, FileOutput, LibraryBig, Settings2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  PipelineSidebarExportDialogHost,
  PipelineSidebarPipelinesSection,
  PipelineSidebarRunSection,
} from '../PipelineSidebarSections';
import { useUiStore } from '../../../stores/uiStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChunksStore } from '../../../stores/chunksStore';
import { useLibraryStore } from '../../../stores/libraryStore';
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

export function ProjectRailNext({
  collapsed,
  onRunPipeline,
  onCancelPipeline,
  onRetranslateChunk,
  onReauditChunk,
  onImportDocument,
  onOpenWorkspaceSettings,
}: ProjectRailNextProps) {
  const { t } = useTranslation();
  const closeProject = useProjectStore((state) => state.closeProject);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const hasDocument = useChunksStore((state) => state.chunks.length > 0);
  const setShowLibraryPanel = useLibraryStore((state) => state.setShowLibraryPanel);
  const showExportDialog = useUiStore((state) => state.showExportDialog);
  const setShowExportDialog = useUiStore((state) => state.setShowExportDialog);
  const setProjectContextCollapsed = useUiStore((state) => state.setProjectContextCollapsed);

  if (collapsed) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center">
        {/* Top: espandi */}
        <div className="flex h-20 shrink-0 items-center justify-center border-b border-editorial-border">
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setProjectContextCollapsed(false)}
            title={t('sidebar.expand')}
            tooltipSide="right"
          >
            <ChevronRight size={14} />
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

        {/* Bottom fisso: 4 azioni */}
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
            onClick={onOpenWorkspaceSettings}
            disabled={!onOpenWorkspaceSettings}
            title={t('workspace.configure')}
            tooltipSide="right"
          >
            <Settings2 size={14} />
          </IconButton>
          <IconButton
            size="md"
            tone="muted"
            onClick={onImportDocument}
            disabled={!onImportDocument}
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
      {/* Top: collassa + libreria */}
      <div className="flex h-20 shrink-0 items-center gap-1.5 border-b border-editorial-border px-3">
        <IconButton
          size="md"
          tone="muted"
          onClick={() => setProjectContextCollapsed(true)}
          title={t('sidebar.collapse')}
          tooltipSide="right"
        >
          <ChevronLeft size={14} />
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
      </div>

      {/* Contenuto scrollabile */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden">
        <div className="flex flex-col">
          <div className="flex flex-col gap-3 px-0 pb-3 pt-4">
            <PipelineSidebarPipelinesSection collapsed={false} configTrigger="circle" />
            <PipelineSidebarRunSection
              collapsed={false}
              onRunPipeline={onRunPipeline}
              onCancelPipeline={onCancelPipeline}
              onRetranslateChunk={onRetranslateChunk}
              showAuditOnly={false}
              playFirst
            />
          </div>
          {onReauditChunk && (
            <ChunkInspectorPanel onReauditChunk={onReauditChunk} />
          )}
        </div>
      </div>

      {/* Bottom fisso */}
      <div className="flex h-12 shrink-0 items-center justify-around border-t border-editorial-border px-2">
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
          onClick={onOpenWorkspaceSettings}
          disabled={!onOpenWorkspaceSettings}
          title={t('workspace.configure')}
          tooltipSide="right"
        >
          <Settings2 size={14} />
        </IconButton>
        <IconButton
          size="md"
          tone="muted"
          onClick={onImportDocument}
          disabled={!onImportDocument}
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
          title={`${t('header.exportLabel')} (Ctrl+E)`}
          ariaLabel={t('header.exportLabel')}
          tooltipSide="right"
        >
          <FileOutput size={14} />
        </IconButton>
      </div>

      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}
