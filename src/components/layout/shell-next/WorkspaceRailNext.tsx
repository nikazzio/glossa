import { useState } from 'react';
import {
  Archive,
  BarChart3,
  BookOpenText,
  FilePen,
  LayoutDashboard,
  LibraryBig,
  PanelLeftClose,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../../stores/projectStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useUiStore } from '../../../stores/uiStore';
import { dashboardLocation, workspaceLocation, type GlobalArea } from '../../../navigation/appLocation';
import type { Workspace } from '../../../types';
import { IconButton } from '../../ui';
import { CreateWorkspaceDialog } from '../../workspace/CreateWorkspaceDialog';
import { ShellNavItem, ShellNavSection } from '../ShellNav';
import { RailBrandToggle } from './RailBrandToggle';
import { WorkspaceIcon } from '../../workspace/WorkspaceIdentity';

const AREA_ITEMS: ReadonlyArray<{ id: GlobalArea; icon: typeof BookOpenText; enabled: boolean }> = [
  { id: 'translations', icon: BookOpenText, enabled: true },
  { id: 'library', icon: LibraryBig, enabled: true },
  { id: 'transcriptions', icon: FilePen, enabled: true },
  { id: 'analysis', icon: BarChart3, enabled: true },
];

/** Dashboard: home dell'applicazione — sopra e fuori dalle aree del workspace. */
function DashboardItem({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const location = useUiStore((state) => state.location);
  const navigate = useUiStore((state) => state.navigate);
  const active = location.area === 'dashboard';

  return (
    <div className="px-2.5 pt-1">
      <ShellNavItem
        active={active}
        collapsed={collapsed}
        labelFont="display"
        onClick={() => navigate(dashboardLocation())}
        ariaCurrent={active ? 'page' : undefined}
        icon={
          // Cerchietto sempre in tinta accent: la home dell'app spicca sulle voci di sezione.
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
              collapsed ? 'h-9 w-9' : 'h-7 w-7'
            } ${
              active
                ? 'border-editorial-accent text-editorial-accent'
                : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
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
  const location = useUiStore((state) => state.location);
  const navigate = useUiStore((state) => state.navigate);

  return (
    <ShellNavSection icon={BookOpenText} label={t('sidebar.areaLabel')} collapsed={collapsed}>
      {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => {
        const active = enabled && location.area === id;
        return (
          <ShellNavItem
            key={id}
            active={active}
            disabled={!enabled}
            collapsed={collapsed}
            labelFont="display"
            onClick={enabled ? () => navigate({ area: id }) : undefined}
            ariaCurrent={active ? 'page' : undefined}
            icon={
              <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  collapsed ? 'h-9 w-9' : 'h-6 w-6'
                } ${
                  active
                    ? 'border-editorial-accent text-editorial-accent'
                    : enabled
                      ? 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/30 hover:text-editorial-accent'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
                }`}
              >
                <Icon size={collapsed ? 15 : 12} />
              </span>
            }
            label={t(`areas.${id}.title`)}
            hint={t(`areas.${id}.sidebarHint`)}
          />
        );
      })}
    </ShellNavSection>
  );
}

/**
 * Workspace: lista sciolta, sempre visibile. Il click NAVIGA alla pagina del
 * workspace (e lo rende attivo). Un solo indicatore, come nel resto del rail:
 * acceso solo quando quella riga è la vista corrente.
 */
function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const closeProject = useProjectStore((s) => s.closeProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const location = useUiStore((state) => state.location);
  const navigate = useUiStore((state) => state.navigate);

  const handleOpenWorkspace = async (ws: Workspace) => {
    if (ws.id !== activeWorkspace?.id) {
      closeProject();
      await setActive(ws);
      await loadProjects();
    }
    navigate(workspaceLocation(ws.id));
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
          const isCurrentView = location.area === 'workspace' && location.workspaceId === ws.id;
          return (
            <ShellNavItem
              key={ws.id}
              active={isCurrentView}
              collapsed={collapsed}
              labelFont="display"
              onClick={() => void handleOpenWorkspace(ws)}
              ariaCurrent={isCurrentView ? 'page' : undefined}
              icon={<WorkspaceIcon iconKey={ws.iconKey} size={collapsed ? 17 : 14} />}
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
          <RailBrandToggle onExpand={() => setCollapsed(false)} title={t('sidebar.expand')} />
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
