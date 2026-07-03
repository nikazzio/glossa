import { useState } from 'react';
import {
  Archive,
  BookOpenText,
  FilePen,
  LibraryBig,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../../stores/projectStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useUiStore } from '../../../stores/uiStore';
import type { Workspace } from '../../../types';
import { Dialog, DialogCancelButton, DialogConfirmButton, IconButton } from '../../ui';
import { ShellNavItem, ShellNavSection } from '../ShellNav';

const AREA_ITEMS = [
  { id: 'translations', icon: BookOpenText, enabled: true },
  { id: 'library', icon: LibraryBig, enabled: false },
  { id: 'transcriptions', icon: FilePen, enabled: false },
] as const;

/** Aree: livello principale della barra — a quale tipo di contenuto stai lavorando. */
function AreaSection({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const activeWorkspaceArea = useUiStore((state) => state.activeWorkspaceArea);
  const setActiveWorkspaceArea = useUiStore((state) => state.setActiveWorkspaceArea);

  return (
    <ShellNavSection icon={BookOpenText} label={t('sidebar.areaLabel')} collapsed={collapsed}>
      {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => {
        const active = enabled && activeWorkspaceArea === id;
        return (
          <ShellNavItem
            key={id}
            active={active}
            disabled={!enabled}
            collapsed={collapsed}
            labelFont="display"
            onClick={
              enabled
                ? () => setActiveWorkspaceArea(activeWorkspaceArea === id ? null : id)
                : undefined
            }
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

/**
 * Workspace: cartelle secondarie dentro un'area (aggregano gli oggetti di
 * quell'area). Lista verticale sempre visibile, anche a barra collassata —
 * a differenza del cambio pipeline, qui non è un popover: sono contenitori,
 * non una modalità alternativa.
 */
function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [showCreateWsForm, setShowCreateWsForm] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [savingWs, setSavingWs] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const createAndActivate = useWorkspaceStore((s) => s.createAndActivate);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const closeProject = useProjectStore((s) => s.closeProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const closeCreateWorkspaceForm = () => {
    setShowCreateWsForm(false);
    setNewWsName('');
    setNewWsDesc('');
  };

  const handleSwitchWorkspace = async (ws: Workspace) => {
    if (ws.id === activeWorkspace?.id) return;
    closeProject();
    await setActive(ws);
    await loadProjects();
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    setSavingWs(true);
    try {
      closeProject();
      await createAndActivate({
        name: newWsName.trim(),
        description: newWsDesc.trim() || undefined,
        embeddingModel: 'text-embedding-3-small',
      });
      await loadProjects();
      toast.success(t('workspace.created'));
      closeCreateWorkspaceForm();
    } catch (err: unknown) {
      toast.error(t('workspace.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingWs(false);
    }
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
            onClick={() => setShowCreateWsForm(true)}
            title={t('workspace.create')}
            tooltipSide="right"
            className="bg-editorial-textbox/25 hover:bg-editorial-textbox/45"
          >
            <Plus size={11} />
          </IconButton>
        }
      >
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspace?.id;
          return (
            <ShellNavItem
              key={ws.id}
              active={isActive}
              collapsed={collapsed}
              onClick={() => void handleSwitchWorkspace(ws)}
              ariaCurrent={isActive ? 'page' : undefined}
              icon={
                <span
                  className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-200 ${
                    isActive ? 'bg-editorial-accent' : 'border border-editorial-border bg-transparent'
                  }`}
                  aria-hidden="true"
                />
              }
              label={ws.name}
            />
          );
        })}
      </ShellNavSection>

      <Dialog
        open={showCreateWsForm}
        onOpenChange={(open) => {
          if (!open) closeCreateWorkspaceForm();
        }}
        title={t('workspace.create')}
        closeLabel={t('common.cancel')}
        widthClassName="max-w-lg"
        bodyClassName="px-5 py-5"
        footer={
          <div className="flex justify-end gap-2">
            <DialogCancelButton onClick={closeCreateWorkspaceForm}>
              {t('common.cancel')}
            </DialogCancelButton>
            <DialogConfirmButton
              onClick={() => void handleCreateWorkspace()}
              disabled={!newWsName.trim() || savingWs}
            >
              {savingWs ? t('workspace.saving') : t('common.save')}
            </DialogConfirmButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
              {t('workspace.nameLabel')}
            </span>
            <input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateWorkspace();
              }}
              placeholder={t('workspace.namePlaceholder')}
              className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              autoFocus
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
              {t('workspace.descriptionLabel')}
            </span>
            <textarea
              value={newWsDesc}
              onChange={(e) => setNewWsDesc(e.target.value)}
              placeholder={t('workspace.descriptionPlaceholder')}
              className="min-h-16 w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </label>
        </div>
      </Dialog>
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
            tone="muted"
            onClick={() => setCollapsed(false)}
            title={t('sidebar.expand')}
            tooltipSide="right"
          >
            <PanelLeftOpen size={14} />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-4 pt-2">
          <AreaSection collapsed />
          <WorkspaceSection collapsed />
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
        <AreaSection collapsed={false} />
        <WorkspaceSection collapsed={false} />
      </div>
    </div>
  );
}
