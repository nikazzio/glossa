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
  Search,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../../stores/projectStore';
import { useChunksStore } from '../../../stores/chunksStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useUiStore } from '../../../stores/uiStore';
import { dashboardLocation, workspaceLocation, type AppLocation, type GlobalArea } from '../../../navigation/appLocation';
import type { Workspace } from '../../../types';
import { AREA_INK_CLASSNAME, IconButton, type InkedArea } from '../../ui';
import { CreateWorkspaceDialog } from '../../workspace/CreateWorkspaceDialog';
import { ShellNavItem, ShellNavSection } from '../ShellNav';
import { RailBrandToggle } from './RailBrandToggle';
import { WorkspaceIcon } from '../../workspace/WorkspaceIdentity';

/** Le aree con un inchiostro proprio: la loro icona lo porta anche a riposo. */
function isInkedArea(area: GlobalArea): area is InkedArea {
  return area in AREA_INK_CLASSNAME;
}

const AREA_ITEMS: ReadonlyArray<{ id: GlobalArea; icon: typeof BookOpenText; enabled: boolean }> = [
  { id: 'library', icon: LibraryBig, enabled: true },
  { id: 'translations', icon: BookOpenText, enabled: true },
  { id: 'transcriptions', icon: FilePen, enabled: true },
  { id: 'analysis', icon: BarChart3, enabled: true },
];

/**
 * La barra resta anche dentro una traduzione aperta: lì l'area attiva è
 * Traduzioni, e ogni voce chiude la traduzione prima di portare altrove.
 * Mentre la pipeline lavora le voci si spengono, come il ritorno al catalogo:
 * uscire chiuderebbe il progetto sotto i piedi del lavoro in corso.
 */
function useRailNavigation() {
  const navigate = useUiStore((state) => state.navigate);
  const location = useUiStore((state) => state.location);
  const projectOpen = useProjectStore((s) => s.currentProjectId !== null);
  const leaveProject = useProjectStore((s) => s.leaveProject);
  const isProcessing = useChunksStore((s) => s.isProcessing);
  // Prima si salva: se il salvataggio fallisce si resta nella traduzione,
  // con l'errore in vista, invece di perdere l'ultima modifica.
  const go = async (next: AppLocation) => {
    if (projectOpen && !(await leaveProject())) return;
    navigate(next);
  };
  const { t } = useTranslation();
  const blocked = projectOpen && isProcessing;
  return { location, projectOpen, blocked, blockedReason: blocked ? t('document.reasonRunning') : null, go };
}

/** Dashboard: home dell'applicazione — sopra e fuori dalle aree del workspace. */
function DashboardItem({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { location, projectOpen, blocked, blockedReason, go } = useRailNavigation();
  const active = !projectOpen && location.area === 'dashboard';

  return (
    <div className="px-2.5 pt-1">
      <ShellNavItem
        active={active}
        disabled={blocked}
        disabledReason={blockedReason}
        collapsed={collapsed}
        labelFont="display"
        onClick={() => void go(dashboardLocation())}
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
      <DashboardViews collapsed={collapsed} />
    </div>
  );
}

/**
 * Le due viste della Dashboard: panoramica e ricerca. Stanno qui, sotto la voce a cui appartengono, invece di occupare
 * una riga di linguette dentro la pagina.
 */
const DASHBOARD_VIEWS: { view?: 'search'; labelKey: string; icon: LucideIcon }[] = [
  { labelKey: 'overview.title', icon: LayoutDashboard },
  { view: 'search', labelKey: 'federation.title', icon: Search },
];

function DashboardViews({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { location, projectOpen, blocked, blockedReason, go } = useRailNavigation();
  const current = location.area === 'dashboard' ? location.view : undefined;

  return (
    <div className={collapsed ? 'mt-1 space-y-0.5' : 'mt-0.5 space-y-0.5 pl-4'}>
      {DASHBOARD_VIEWS.map(({ view, labelKey, icon: Icon }) => {
        const active = !projectOpen && location.area === 'dashboard' && current === view;
        return (
          <ShellNavItem
            key={labelKey}
            active={active}
            disabled={blocked}
            disabledReason={blockedReason}
            collapsed={collapsed}
            onClick={() => void go(dashboardLocation(view ? { view } : undefined))}
            ariaCurrent={active ? 'page' : undefined}
            icon={
              <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  collapsed ? 'h-8 w-8' : 'h-5 w-5'
                } ${
                  active
                    ? 'border-editorial-accent text-editorial-accent'
                    : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/30 hover:text-editorial-accent'
                }`}
              >
                <Icon size={collapsed ? 13 : 11} />
              </span>
            }
            label={t(labelKey)}
          />
        );
      })}
    </div>
  );
}

/**
 * Aree del workspace attivo. Radio con Dashboard e workspace: sempre
 * esattamente una vista attiva, click sull'attiva = no-op, mai deselezione.
 */
function AreaSection({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { location, projectOpen, blocked, blockedReason, go } = useRailNavigation();

  return (
    <ShellNavSection icon={BookOpenText} label={t('sidebar.areaLabel')} collapsed={collapsed}>
      {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => {
        const active = enabled && (projectOpen ? id === 'translations' : location.area === id);
        return (
          <ShellNavItem
            key={id}
            active={active}
            disabled={!enabled || blocked}
            disabledReason={blockedReason}
            collapsed={collapsed}
            labelFont="display"
            onClick={enabled ? () => void go({ area: id }) : undefined}
            ariaCurrent={active ? 'page' : undefined}
            icon={
              <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  collapsed ? 'h-9 w-9' : 'h-6 w-6'
                } ${
                  active
                    ? 'border-editorial-accent text-editorial-accent'
                    : enabled
                      ? `border-editorial-border bg-editorial-textbox/30 hover:border-editorial-accent/30 hover:text-editorial-accent ${
                        isInkedArea(id) ? AREA_INK_CLASSNAME[id] : 'text-editorial-muted'}`
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
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const { location, projectOpen, blocked, blockedReason, go } = useRailNavigation();

  const handleOpenWorkspace = async (ws: Workspace) => {
    if (ws.id !== activeWorkspace?.id) {
      if (!(await useProjectStore.getState().leaveProject())) return;
      await setActive(ws);
      await loadProjects();
    }
    await go(workspaceLocation(ws.id));
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
          const isCurrentView = !projectOpen && location.area === 'workspace' && location.workspaceId === ws.id;
          return (
            <ShellNavItem
              key={ws.id}
              active={isCurrentView}
              disabled={blocked}
              disabledReason={blockedReason}
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
