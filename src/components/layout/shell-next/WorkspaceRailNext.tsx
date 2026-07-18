import { useState } from 'react';
import {
  Archive,
  BookOpenText,
  FilePen,
  LayoutDashboard,
  LibraryBig,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../../stores/projectStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useUiStore } from '../../../stores/uiStore';
import type { Workspace } from '../../../types';
import { IconButton } from '../../ui';
import { CreateWorkspaceDialog } from '../../workspace/CreateWorkspaceDialog';
import { ShellNavItem, ShellNavSection } from '../ShellNav';

const AREA_ITEMS = [
  { id: 'translations', icon: BookOpenText, enabled: true },
  { id: 'library', icon: LibraryBig, enabled: false },
  { id: 'transcriptions', icon: FilePen, enabled: false },
] as const;

/** Dashboard: home dell'applicazione — sopra e fuori dalle aree del workspace. */
function DashboardItem({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const activeWorkspaceView = useUiStore((state) => state.activeWorkspaceView);
  const setActiveWorkspaceView = useUiStore((state) => state.setActiveWorkspaceView);
  const active = activeWorkspaceView === 'dashboard';

  return (
    <div className="px-2.5 pt-1">
      <ShellNavItem
        active={active}
        collapsed={collapsed}
        labelFont="display"
        onClick={() => setActiveWorkspaceView('dashboard')}
        ariaCurrent={active ? 'page' : undefined}
        icon={
          // Cerchietto sempre in tinta accent: la home dell'app spicca sulle voci di sezione.
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
              collapsed ? 'h-9 w-9' : 'h-7 w-7'
            } ${
              active
                ? 'border-editorial-accent/60 bg-editorial-accent/15 text-editorial-accent'
                : 'border-editorial-accent/35 bg-editorial-accent/5 text-editorial-accent'
            }`}
          >
            <LayoutDashboard size={collapsed ? 16 : 14} />
          </span>
        }
        label={t('dashboard.title')}
        hint={t('dashboard.navHint')}
      />
    </div>
  );
}

/**
 * Aree del workspace attivo. Radio con Dashboard e workspace: sempre
 * esattamente una vista attiva, click sull'attiva = no-op, mai deselezione.
 */
function AreaSection({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const activeWorkspaceView = useUiStore((state) => state.activeWorkspaceView);
  const setActiveWorkspaceView = useUiStore((state) => state.setActiveWorkspaceView);

  return (
    <ShellNavSection icon={BookOpenText} label={t('sidebar.areaLabel')} collapsed={collapsed}>
      {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => {
        const active = enabled && activeWorkspaceView === id;
        return (
          <ShellNavItem
            key={id}
            active={active}
            disabled={!enabled}
            collapsed={collapsed}
            labelFont="display"
            onClick={enabled ? () => setActiveWorkspaceView(id) : undefined}
            ariaCurrent={active ? 'page' : undefined}
            icon={
              <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  collapsed ? 'h-9 w-9' : 'h-6 w-6'
                } ${
                  active
                    ? 'border-editorial-accent/45 bg-editorial-accent/10 text-editorial-accent'
                    : enabled
                      ? 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/30 hover:text-editorial-accent'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
                }`}
              >
                <Icon size={collapsed ? 15 : 12} />
              </span>
            }
            label={t(`workspace.areas.${id}.title`)}
            hint={t(`workspace.areas.${id}.sidebarHint`)}
          />
        );
      })}
    </ShellNavSection>
  );
}

/**
 * Workspace: lista sciolta, sempre visibile. Il click NAVIGA alla pagina del
 * workspace (e lo rende attivo): il pallino indica il contesto attivo, la
 * barra accent indica la vista corrente — due semantiche, due indicatori.
 */
function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const closeProject = useProjectStore((s) => s.closeProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const activeWorkspaceView = useUiStore((state) => state.activeWorkspaceView);
  const setActiveWorkspaceView = useUiStore((state) => state.setActiveWorkspaceView);

  const handleOpenWorkspace = async (ws: Workspace) => {
    if (ws.id !== activeWorkspace?.id) {
      closeProject();
      await setActive(ws);
      await loadProjects();
    }
    setActiveWorkspaceView('workspace');
  };

  return (
    <>
      <ShellNavSection
        icon={Archive}
        label={t('sidebar.workspaceSection')}
        collapsed={collapsed}
        action={
          <IconButton
            size="sm"
            tone="muted"
            onClick={() => setShowCreateDialog(true)}
            title={t('workspace.create')}
            tooltipSide="right"
            className="bg-editorial-textbox/25 hover:bg-editorial-textbox/45"
          >
            <Plus size={11} />
          </IconButton>
        }
      >
        {workspaces.map((ws) => {
          const isContext = ws.id === activeWorkspace?.id;
          const isCurrentView = isContext && activeWorkspaceView === 'workspace';
          return (
            <ShellNavItem
              key={ws.id}
              active={isCurrentView}
              collapsed={collapsed}
              labelFont="display"
              onClick={() => void handleOpenWorkspace(ws)}
              ariaCurrent={isCurrentView ? 'page' : undefined}
              icon={
                // Da collassata il pallino vive in uno slot h-9: righe alte quanto la barra progetto.
                <span
                  className={`inline-flex shrink-0 items-center justify-center ${collapsed ? 'h-9 w-9' : ''}`}
                  aria-hidden="true"
                >
                  <span
                    className={`rounded-full transition-colors duration-200 ${collapsed ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${
                      isContext ? 'bg-editorial-accent' : 'border border-editorial-border bg-transparent'
                    }`}
                  />
                </span>
              }
              label={ws.name}
            />
          );
        })}
      </ShellNavSection>
      <CreateWorkspaceDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
    </>
  );
}

export interface WorkspaceRailNextProps {
  collapsed: boolean;
}

export function WorkspaceRailNext({ collapsed }: WorkspaceRailNextProps) {
  const { t } = useTranslation();
  const setCollapsed = useUiStore((state) => state.setDashboardSidebarCollapsed);

  if (collapsed) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center">
        <div className="flex h-20 w-full shrink-0 items-center justify-center">
          <IconButton
            size="md"
            tone="default"
            onClick={() => setCollapsed(false)}
            title={t('sidebar.expand')}
            tooltipSide="right"
            className="h-9 w-9 bg-editorial-bg"
          >
            <PanelLeftOpen size={14} />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
          <DashboardItem collapsed />
          <AreaSection collapsed />
          <WorkspaceSection collapsed />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: collassa a destra, allineato alla barra progetto */}
      <div className="flex h-20 shrink-0 items-center justify-end px-3">
        <IconButton
          size="md"
          tone="default"
          onClick={() => setCollapsed(true)}
          title={t('sidebar.collapse')}
          tooltipSide="bottom"
          className="h-9 w-9 shrink-0 bg-editorial-bg"
        >
          <PanelLeftClose size={14} />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
        <DashboardItem collapsed={false} />
        <AreaSection collapsed={false} />
        <WorkspaceSection collapsed={false} />
      </div>
    </div>
  );
}
