import { ArrowLeft, FileOutput, LibraryBig, Settings2, Upload } from 'lucide-react';
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

/**
 * Shell nuova (#291) — barra del progetto, struttura del mock approvato.
 * Niente più voci/tab di sezione: solo una fila di azioni di progetto in cima
 * (back · libreria · workspace · importa · esporta) e la colonna operativa
 * (selettore pipeline + comandi Esegui) sempre visibile. Le impostazioni di
 * vista del documento sono uscite dalla barra (vivono nella barra alto del
 * documento). Larghezza/collasso sono gestiti dal Panel di ShellNext;
 * `collapsed` arriva dal panel e mostra la colonna in versione icone.
 */
export interface ProjectRailNextProps {
  collapsed: boolean;
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
  onOpenWorkspaceSettings?: () => void;
}

export function ProjectRailNext({
  collapsed,
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Azioni di progetto: back · libreria · workspace · importa · esporta (ambito file/progetto). */}
      <div className={`flex items-center gap-1 pt-2 ${collapsed ? 'flex-col px-0' : 'flex-nowrap px-2'}`}>
        <IconButton
          size="sm"
          tone="muted"
          onClick={() => closeProject()}
          disabled={isProcessing}
          title={t('sidebar.backToWorkspace')}
          tooltipSide="right"
          className="bg-editorial-textbox/25 hover:bg-editorial-textbox/45 shrink-0"
        >
          <ArrowLeft size={12} />
        </IconButton>
        {!collapsed && (
          <>
            <IconButton
              size="sm"
              tone="muted"
              onClick={() => setShowLibraryPanel(true)}
              title={t('library.openLibrary')}
              tooltipSide="right"
            >
              <LibraryBig size={12} />
            </IconButton>
            <IconButton
              size="sm"
              tone="muted"
              onClick={onOpenWorkspaceSettings}
              disabled={!onOpenWorkspaceSettings}
              title={t('workspace.configure')}
              tooltipSide="right"
            >
              <Settings2 size={12} />
            </IconButton>
            <span className="mx-0.5 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
            <IconButton
              size="sm"
              tone="muted"
              onClick={onImportDocument}
              disabled={!onImportDocument}
              title={t('files.import')}
              tooltipSide="right"
            >
              <Upload size={12} />
            </IconButton>
            <IconButton
              size="sm"
              tone="muted"
              onClick={() => setShowExportDialog(true)}
              disabled={!hasDocument}
              title={`${t('header.exportLabel')} (Ctrl+E)`}
              ariaLabel={t('header.exportLabel')}
              tooltipSide="right"
            >
              <FileOutput size={12} />
            </IconButton>
          </>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden border-t border-editorial-border/50 pb-3 pt-5">
        <div className="flex flex-col gap-3">
          <PipelineSidebarPipelinesSection collapsed={collapsed} configTrigger="circle" />
          <PipelineSidebarRunSection
            collapsed={collapsed}
            onRunPipeline={onRunPipeline}
            onRunAuditOnly={onRunAuditOnly}
            onCancelPipeline={onCancelPipeline}
            onDryRun={onDryRun}
            onRetranslateChunk={onRetranslateChunk}
            showAuditOnly={false}
          />
        </div>
      </div>

      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}
