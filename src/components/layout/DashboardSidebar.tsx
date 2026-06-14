import { useState } from 'react';
import { Archive, BookOpenText, FilePen, LibraryBig, Plus, Settings2, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import type { Workspace } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton } from '../ui';
import { WorkspaceSettingsModal } from '../workspace/WorkspaceSettingsModal';
import { ShellNavItem, ShellNavSection } from './ShellNav';
import { ResizeHandle, useEdgeResize } from './useEdgeResize';

const AREA_ITEMS = [
  { id: 'translations', icon: BookOpenText, enabled: true },
  { id: 'library', icon: LibraryBig, enabled: false },
  { id: 'transcriptions', icon: FilePen, enabled: false },
] as const;

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 320;
const SIDEBAR_COLLAPSE_AT = 150;
const SIDEBAR_COLLAPSED = 64;

export function DashboardSidebar() {
  const { t } = useTranslation();
  const { workspaces, activeWorkspace, createAndActivate, setActive, removeWorkspace } = useWorkspaceStore();
  const { projects, closeProject, loadProjects } = useProjectStore();
  const collapsed = useUiStore((state) => state.dashboardSidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setDashboardSidebarCollapsed);
  const width = useUiStore((state) => state.dashboardSidebarWidth);
  const setWidth = useUiStore((state) => state.setDashboardSidebarWidth);
  const { dragging, startDrag } = useEdgeResize();

  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showCreateWsForm, setShowCreateWsForm] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [savingWs, setSavingWs] = useState(false);

  const closeCreateWorkspaceForm = () => {
    setShowCreateWsForm(false);
    setNewWsName('');
    setNewWsDesc('');
  };
  const createDialogRef = useFocusTrap(showCreateWsForm, closeCreateWorkspaceForm);

  const handleSwitchWorkspace = async (ws: Workspace) => {
    if (ws.id === activeWorkspace?.id) return;
    closeProject();
    await setActive(ws);
    await loadProjects();
  };

  // Pattern activity-bar: click sul workspace attivo fa da toggle della barra.
  const handleWorkspaceClick = (ws: Workspace) => {
    const isActive = ws.id === activeWorkspace?.id;
    if (collapsed) {
      setCollapsed(false);
      if (!isActive) void handleSwitchWorkspace(ws);
      return;
    }
    if (isActive) {
      setCollapsed(true);
      return;
    }
    void handleSwitchWorkspace(ws);
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

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace) return;
    if (projects.length > 0) {
      await confirm({
        title: t('workspace.deleteBlockedTitle'),
        message: t('workspace.deleteBlockedMessage', { count: projects.length }),
        confirmLabel: t('common.confirm'),
        danger: true,
      });
      return;
    }
    const ok = await confirm({
      title: t('workspace.deleteTitle'),
      message: t('workspace.deleteMessage', { name: activeWorkspace.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeWorkspace(activeWorkspace.id);
      toast.success(t('workspace.deleted'));
    } catch (err: unknown) {
      toast.error(t('workspace.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleResizeStart = (event: React.PointerEvent) => {
    startDrag(event, {
      startWidth: collapsed ? SIDEBAR_COLLAPSED : width,
      min: SIDEBAR_MIN,
      max: SIDEBAR_MAX,
      threshold: SIDEBAR_COLLAPSE_AT,
      mode: 'collapse',
      onWidth: setWidth,
      onCollapsedChange: setCollapsed,
    });
  };

  return (
    <motion.nav
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label={t('sidebar.areaLabel')}
      style={{ width: collapsed ? SIDEBAR_COLLAPSED : width }}
      className={`relative flex shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60 ${
        dragging ? '' : 'transition-[width] duration-200'
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar pb-4 pt-2">
        <ShellNavSection icon={BookOpenText} label={t('sidebar.areaLabel')} collapsed={collapsed}>
          {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => (
            <ShellNavItem
              key={id}
              active={enabled}
              disabled={!enabled}
              collapsed={collapsed}
              labelFont="display"
              onClick={enabled ? () => setCollapsed(!collapsed) : undefined}
              ariaCurrent={enabled ? 'page' : undefined}
              icon={(
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                    enabled
                      ? 'border-editorial-accent/45 bg-editorial-accent/10 text-editorial-accent'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
                  }`}
                >
                  <Icon size={12} />
                </span>
              )}
              label={t(`workspace.areas.${id}.title`)}
              hint={t(`workspace.areas.${id}.sidebarHint`)}
            />
          ))}
        </ShellNavSection>

        <ShellNavSection
          icon={Archive}
          label={t('sidebar.workspaceSection')}
          collapsed={collapsed}
          action={(
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
          )}
        >
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspace?.id;
            return (
              <ShellNavItem
                key={ws.id}
                active={isActive}
                collapsed={collapsed}
                onClick={() => handleWorkspaceClick(ws)}
                ariaCurrent={isActive ? 'page' : undefined}
                icon={(
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-200 ${
                      isActive ? 'bg-editorial-accent' : 'border border-editorial-border bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                )}
                label={ws.name}
                trailing={isActive ? (
                  <>
                    <IconButton
                      size="sm"
                      tone="muted"
                      onClick={() => setShowWorkspaceSettings(true)}
                      title={t('workspace.configure')}
                      tooltipSide="right"
                    >
                      <Settings2 size={12} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      tone="muted"
                      onClick={() => void handleDeleteWorkspace()}
                      title={t('workspace.delete')}
                      tooltipSide="right"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </>
                ) : undefined}
              />
            );
          })}
        </ShellNavSection>
      </div>

      <ResizeHandle onPointerDown={handleResizeStart} dragging={dragging} label={t('sidebar.resize')} />

      <WorkspaceSettingsModal
        open={showWorkspaceSettings}
        onClose={() => setShowWorkspaceSettings(false)}
      />

      {showCreateWsForm && (
        <div
          ref={createDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-workspace-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
        >
          <EditorialModalShell
            titleId="create-workspace-title"
            title={t('workspace.create')}
            closeLabel={t('common.cancel')}
            onClose={closeCreateWorkspaceForm}
            widthClassName="max-w-lg"
            bodyClassName="px-5 py-5"
            footer={
              <div className="flex justify-end gap-2">
                <PillButton onClick={closeCreateWorkspaceForm}>
                  {t('common.cancel')}
                </PillButton>
                <PillButton
                  variant="accent"
                  onClick={() => void handleCreateWorkspace()}
                  disabled={!newWsName.trim() || savingWs}
                >
                  {savingWs ? t('workspace.saving') : t('common.save')}
                </PillButton>
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
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateWorkspace(); }}
                  placeholder={t('workspace.namePlaceholder')}
                  className="w-full rounded-[14px] border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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
                  className="min-h-16 w-full rounded-[14px] border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                />
              </label>
            </div>
          </EditorialModalShell>
        </div>
      )}
    </motion.nav>
  );
}
