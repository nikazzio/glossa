import type { KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
import {
  ArrowLeft,
  BarChart2,
  FileText,
  Layers,
  Play,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { DashboardSidebar } from './DashboardSidebar';
import { ShellNavFooter, ShellNavItem } from './ShellNav';
import { ResizeHandle, useEdgeResize } from './useEdgeResize';
import { EASE_EDITORIAL, WIDTH_TRANSITION_CLASS } from './motion';
import {
  PipelineSidebarDocumentSection,
  PipelineSidebarPipelinesSection,
  PipelineSidebarRunSection,
} from './PipelineSidebarSections';
import { useUiStore } from '../../stores/uiStore';
import type { ProjectPanelTab } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { IconButton } from '../ui';

interface PipelineSidebarProps {
  mode?: 'dashboard' | 'editor';
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
  onOpenWorkspaceSettings?: () => void;
}

const PROJECT_PANEL_TABS: Array<{ id: ProjectPanelTab; icon: ReactNode; labelKey: string }> = [
  { id: 'run', icon: <Play size={15} fill="currentColor" />, labelKey: 'projectShell.runTab' },
  { id: 'pipeline', icon: <Zap size={15} />, labelKey: 'projectShell.pipelineTab' },
  { id: 'document', icon: <FileText size={15} />, labelKey: 'projectShell.documentTab' },
  { id: 'insight', icon: <BarChart2 size={15} />, labelKey: 'projectShell.insightTab' },
  { id: 'chunk', icon: <Layers size={15} />, labelKey: 'projectShell.chunkTab' },
];

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 320;
const SIDEBAR_COLLAPSE_AT = 150;
const SIDEBAR_COLLAPSED = 64;
const SIDEBAR_DEFAULT = 240;

export function PipelineSidebar({
  mode = 'editor',
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
  onImportDocument,
  onOpenWorkspaceSettings,
}: PipelineSidebarProps) {
  const { t } = useTranslation();
  const activeProjectPanel = useUiStore((state) => state.activeProjectPanel);
  const projectContextCollapsed = useUiStore((state) => state.projectContextCollapsed);
  const showDocumentDrawer = useUiStore((state) => state.showDocumentDrawer);
  const showChunkDrawer = useUiStore((state) => state.showChunkDrawer);
  const setActiveProjectPanel = useUiStore((state) => state.setActiveProjectPanel);
  const setProjectContextCollapsed = useUiStore((state) => state.setProjectContextCollapsed);
  const width = useUiStore((state) => state.projectSidebarWidth);
  const setWidth = useUiStore((state) => state.setProjectSidebarWidth);
  const closeProject = useProjectStore((state) => state.closeProject);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const { dragging, startDrag } = useEdgeResize();
  const tabRefs = useRef<Partial<Record<ProjectPanelTab, HTMLButtonElement | null>>>({});

  if (mode === 'dashboard') {
    return <DashboardSidebar />;
  }

  const collapsed = projectContextCollapsed;

  // Pattern activity-bar: l'item attivo fa da toggle del pannello.
  const handleSelect = (panel: ProjectPanelTab) => {
    const isFlyout = panel === 'insight' || panel === 'chunk';
    if (isFlyout) {
      const flyoutOpen = showDocumentDrawer || showChunkDrawer;
      if (activeProjectPanel === panel && flyoutOpen) {
        setActiveProjectPanel('document');
      } else {
        setActiveProjectPanel(panel);
      }
      return;
    }
    // Pannelli inline (run/pipeline/document): cambiare sezione conserva lo stato
    // collassato/espanso; solo il click sulla sezione già attiva fa da toggle.
    if (panel === activeProjectPanel) {
      setProjectContextCollapsed(!collapsed);
    } else {
      setActiveProjectPanel(panel);
    }
  };

  // Rail verticale: roving focus con frecce ↑/↓ + Home/End (WAI-ARIA APG tablist).
  // Attivazione manuale: Enter/Space sul button (gestiti nativamente) o click.
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

  const handleResizeStart = (event: React.PointerEvent) => {
    startDrag(event, {
      startWidth: collapsed ? SIDEBAR_COLLAPSED : width,
      min: SIDEBAR_MIN,
      max: SIDEBAR_MAX,
      threshold: SIDEBAR_COLLAPSE_AT,
      mode: 'collapse',
      onWidth: setWidth,
      onCollapsedChange: setProjectContextCollapsed,
    });
  };

  return (
    <motion.nav
      initial={{ opacity: 0, x: -22 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: EASE_EDITORIAL }}
      aria-label={t('projectShell.railLabel')}
      style={{ width: collapsed ? SIDEBAR_COLLAPSED : width }}
      className={`relative flex shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60 ${
        dragging ? '' : WIDTH_TRANSITION_CLASS
      }`}
    >
      {/* Contenuto ancorato alla larghezza collassata: niente slide orizzontale durante l'animazione. */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ width: collapsed ? SIDEBAR_COLLAPSED : undefined }}
      >
        <div className={`flex items-center pt-2 ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
          <IconButton
            size="sm"
            tone="muted"
            onClick={() => closeProject()}
            disabled={isProcessing}
            title={t('sidebar.backToWorkspace')}
            tooltipSide="right"
            className="bg-editorial-textbox/25 hover:bg-editorial-textbox/45"
          >
            <ArrowLeft size={12} />
          </IconButton>
        </div>

        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('projectShell.railLabel')}
          className="space-y-0.5 px-2.5 pt-2"
        >
          {PROJECT_PANEL_TABS.map((tab) => (
            <ShellNavItem
              key={tab.id}
              id={`project-rail-tab-${tab.id}`}
              role="tab"
              ariaSelected={activeProjectPanel === tab.id}
              ariaControls="project-context-panel"
              active={activeProjectPanel === tab.id}
              collapsed={collapsed}
              tabIndex={activeProjectPanel === tab.id ? 0 : -1}
              buttonRef={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              onClick={() => handleSelect(tab.id)}
              onKeyDown={(event) => handleRailKeyDown(tab.id, event)}
              icon={tab.icon}
              label={t(tab.labelKey)}
            />
          ))}
        </div>

        <div
          id="project-context-panel"
          role="tabpanel"
          aria-labelledby={`project-rail-tab-${activeProjectPanel}`}
          className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden border-t border-editorial-border/50 pb-3 pt-5"
        >
          {activeProjectPanel === 'run' ? (
            <PipelineSidebarRunSection
              collapsed={collapsed}
              onRunPipeline={onRunPipeline}
              onRunAuditOnly={onRunAuditOnly}
              onCancelPipeline={onCancelPipeline}
              onDryRun={onDryRun}
              onRetranslateChunk={onRetranslateChunk}
            />
          ) : activeProjectPanel === 'pipeline' ? (
            <PipelineSidebarPipelinesSection collapsed={collapsed} />
          ) : activeProjectPanel === 'document' ? (
            <PipelineSidebarDocumentSection
              collapsed={collapsed}
              onImportDocument={onImportDocument}
              onOpenWorkspaceSettings={onOpenWorkspaceSettings}
            />
          ) : null}
        </div>

        <ShellNavFooter collapsed={collapsed} />
      </div>

      <ResizeHandle
        onPointerDown={handleResizeStart}
        dragging={dragging}
        label={t('projectShell.resizeRail')}
        width={collapsed ? SIDEBAR_MIN : width}
        min={SIDEBAR_MIN}
        max={SIDEBAR_MAX}
        onResize={(next) => {
          if (collapsed) setProjectContextCollapsed(false);
          setWidth(next);
        }}
        onReset={() => {
          setProjectContextCollapsed(false);
          setWidth(SIDEBAR_DEFAULT);
        }}
      />
    </motion.nav>
  );
}
