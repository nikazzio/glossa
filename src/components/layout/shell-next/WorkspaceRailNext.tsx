import { useRef, useState } from 'react';
import {
  Archive,
  BookOpenText,
  Check,
  ChevronsUpDown,
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
import { IconButton, Menu, type MenuItem } from '../../ui';
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
    <div className="px-2.5 pt-3">
      <ShellNavItem
        active={active}
        collapsed={collapsed}
        labelFont="display"
        onClick={() => setActiveWorkspaceView('dashboard')}
        ariaCurrent={active ? 'page' : undefined}
        icon={<LayoutDashboard size={14} />}
        label={t('dashboard.title')}
        hint={t('dashboard.navHint')}
      />
    </div>
  );
}

/**
 * Switcher del workspace attivo: contesto, non navigazione — una riga col nome
 * corrente che apre il menu di cambio/creazione. Niente stato "attivo" da nav:
 * la selezione di navigazione resta una sola (Dashboard o un'area).
 */
function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const closeProject = useProjectStore((s) => s.closeProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const handleSwitchWorkspace = async (ws: Workspace) => {
    if (ws.id === activeWorkspace?.id) return;
    closeProject();
    await setActive(ws);
    await loadProjects();
  };

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setMenuAnchor(rect ? { x: rect.left, y: rect.bottom } : null);
    setMenuOpen(true);
  };

  const menuItems: MenuItem[] = [
    ...workspaces.map((ws) => ({
      id: ws.id,
      label: ws.name,
      icon: ws.id === activeWorkspace?.id ? <Check size={13} /> : <span className="inline-block w-[13px]" />,
      onSelect: () => void handleSwitchWorkspace(ws),
    })),
    {
      id: 'create-workspace',
      label: t('workspace.create'),
      icon: <Plus size={13} />,
      onSelect: () => setShowCreateDialog(true),
    },
  ];

  return (
    <>
      <ShellNavSection icon={Archive} label={t('sidebar.workspaceSection')} collapsed={collapsed}>
        <ShellNavItem
          active={false}
          collapsed={collapsed}
          labelFont="display"
          onClick={openMenu}
          buttonRef={triggerRef}
          icon={<span className="h-2 w-2 shrink-0 rounded-full bg-editorial-accent" aria-hidden="true" />}
          label={activeWorkspace?.name ?? t('workspace.noActive')}
          trailing={<ChevronsUpDown size={13} className="text-editorial-muted" aria-hidden="true" />}
        />
      </ShellNavSection>
      <Menu open={menuOpen} onOpenChange={setMenuOpen} items={menuItems} anchorRect={menuAnchor} />
      <CreateWorkspaceDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
    </>
  );
}

/**
 * Aree del workspace attivo. Semantica radio con la Dashboard: sempre
 * esattamente una selezione di navigazione, click sull'attiva = no-op,
 * mai deselezione.
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
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  active
                    ? 'border-editorial-accent/45 bg-editorial-accent/10 text-editorial-accent'
                    : enabled
                      ? 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/30 hover:text-editorial-accent'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
                }`}
              >
                <Icon size={12} />
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
            tone="muted"
            onClick={() => setCollapsed(false)}
            title={t('sidebar.expand')}
            tooltipSide="right"
          >
            <PanelLeftOpen size={14} />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-4 pt-2">
          <DashboardItem collapsed />
          <WorkspaceSwitcher collapsed />
          <AreaSection collapsed />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-20 shrink-0 items-center gap-3 px-3">
        <IconButton
          size="md"
          tone="muted"
          onClick={() => setCollapsed(true)}
          title={t('sidebar.collapse')}
          tooltipSide="bottom"
        >
          <PanelLeftClose size={14} />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
        <DashboardItem collapsed={false} />
        <WorkspaceSwitcher collapsed={false} />
        <AreaSection collapsed={false} />
      </div>
    </div>
  );
}
