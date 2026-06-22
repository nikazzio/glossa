import type { KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { ArrowLeft, FileText, LibraryBig, Settings2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShellNavFooter, ShellNavItem } from '../ShellNav';
import {
  PipelineSidebarDocumentSection,
  PipelineSidebarPipelinesSection,
  PipelineSidebarRunSection,
} from '../PipelineSidebarSections';
import { useUiStore } from '../../../stores/uiStore';
import type { ProjectPanelTab } from '../../../stores/uiStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChunksStore } from '../../../stores/chunksStore';
import { useLibraryStore } from '../../../stores/libraryStore';
import { IconButton } from '../../ui';

/**
 * Shell nuova (#291) — contenuto del rail progetto.
 * A differenza di PipelineSidebar non gestisce larghezza/resize/collasso: quelli
 * vivono nel Panel di react-resizable-panels (ShellNext). Qui `collapsed` arriva
 * dal panel e `onToggleCollapse` comanda collapse/expand del panel.
 */
export interface ProjectRailNextProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
  onOpenWorkspaceSettings?: () => void;
}

// Colonna operativa unica (selettore pipeline + comandi Esegui) + Documento.
// Approfondimenti/Frammento vivono ora nell'ispettore destro.
const PROJECT_PANEL_TABS: Array<{ id: ProjectPanelTab; icon: ReactNode; labelKey: string }> = [
  { id: 'pipeline', icon: <Zap size={15} />, labelKey: 'projectShell.pipelineTab' },
  { id: 'document', icon: <FileText size={15} />, labelKey: 'projectShell.documentTab' },
];

export function ProjectRailNext({
  collapsed,
  onToggleCollapse,
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
  onImportDocument,
  onOpenWorkspaceSettings,
}: ProjectRailNextProps) {
  const { t } = useTranslation();
  const activeProjectPanel = useUiStore((state) => state.activeProjectPanel);
  const setActiveProjectPanel = useUiStore((state) => state.setActiveProjectPanel);
  const closeProject = useProjectStore((state) => state.closeProject);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const setShowLibraryPanel = useLibraryStore((state) => state.setShowLibraryPanel);
  const tabRefs = useRef<Partial<Record<ProjectPanelTab, HTMLButtonElement | null>>>({});

  // 'run' e 'pipeline' sono lo stesso pannello operativo (selettore + comandi Esegui).
  const isOperative = activeProjectPanel === 'run' || activeProjectPanel === 'pipeline';
  const tabIsActive = (id: ProjectPanelTab) => (id === 'pipeline' ? isOperative : activeProjectPanel === id);

  // Pattern activity-bar: click sulla sezione già attiva → collassa/espande il panel.
  const handleSelect = (panel: ProjectPanelTab) => {
    if (tabIsActive(panel)) {
      onToggleCollapse();
    } else {
      setActiveProjectPanel(panel);
    }
  };

  // Rail verticale: roving focus con frecce ↑/↓ + Home/End (WAI-ARIA APG tablist).
  const handleRailKeyDown = (tabId: ProjectPanelTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = PROJECT_PANEL_TABS.findIndex((tab) => tab.id === tabId);
    let nextIdx: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      nextIdx = (idx + 1) % PROJECT_PANEL_TABS.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      nextIdx = (idx - 1 + PROJECT_PANEL_TABS.length) % PROJECT_PANEL_TABS.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = PROJECT_PANEL_TABS.length - 1;
    if (nextIdx === null) return;
    event.preventDefault();
    tabRefs.current[PROJECT_PANEL_TABS[nextIdx].id]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex items-center pt-2 gap-1 ${collapsed ? 'justify-center px-0' : 'px-2'}`}>
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
            <div className="flex-1" />
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
          </>
        )}
      </div>

      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('projectShell.railLabel')}
        className="space-y-0.5 px-2.5 pt-2"
      >
        {PROJECT_PANEL_TABS.map((tab) => {
          const isActive = tabIsActive(tab.id);
          return (
            <ShellNavItem
              key={tab.id}
              id={`project-rail-tab-${tab.id}`}
              role="tab"
              ariaSelected={isActive}
              ariaControls="project-context-panel"
              active={isActive}
              collapsed={collapsed}
              tabIndex={isActive ? 0 : -1}
              buttonRef={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              onClick={() => handleSelect(tab.id)}
              onKeyDown={(event) => handleRailKeyDown(tab.id, event)}
              icon={tab.icon}
              label={t(tab.labelKey)}
            />
          );
        })}
      </div>

      <div
        id="project-context-panel"
        role="tabpanel"
        aria-labelledby={`project-rail-tab-${isOperative ? 'pipeline' : activeProjectPanel}`}
        className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden border-t border-editorial-border/50 pb-3 pt-5"
      >
        {isOperative ? (
          <div className="flex flex-col gap-3">
            <PipelineSidebarPipelinesSection collapsed={collapsed} configTrigger="circle" />
            <PipelineSidebarRunSection
              collapsed={collapsed}
              onRunPipeline={onRunPipeline}
              onRunAuditOnly={onRunAuditOnly}
              onCancelPipeline={onCancelPipeline}
              onDryRun={onDryRun}
              onRetranslateChunk={onRetranslateChunk}
            />
          </div>
        ) : activeProjectPanel === 'document' ? (
          <PipelineSidebarDocumentSection collapsed={collapsed} onImportDocument={onImportDocument} />
        ) : null}
      </div>

      <ShellNavFooter collapsed={collapsed} />
    </div>
  );
}
