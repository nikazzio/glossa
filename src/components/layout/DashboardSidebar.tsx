import { useState } from 'react';
import type { ReactNode } from 'react';
import { Archive, BookOpenText, FilePen, LibraryBig, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { EmbeddingModel, Workspace } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton, SectionLabel } from '../ui';

const AREA_ITEMS = [
  { id: 'translations', icon: BookOpenText, enabled: true },
  { id: 'library', icon: LibraryBig, enabled: false },
  { id: 'transcriptions', icon: FilePen, enabled: false },
] as const;

const ATTACHED_TAB_TRANSITION = {
  type: 'spring',
  stiffness: 360,
  damping: 40,
  mass: 0.8,
} as const;

export function DashboardSidebar() {
  const { t } = useTranslation();
  const { workspaces, activeWorkspace, createAndActivate, setActive } = useWorkspaceStore();
  const { closeProject, loadProjects } = useProjectStore();

  const [showCreateWsForm, setShowCreateWsForm] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [newWsModel, setNewWsModel] = useState<EmbeddingModel>('text-embedding-3-small');
  const [savingWs, setSavingWs] = useState(false);

  const closeCreateWorkspaceForm = () => {
    setShowCreateWsForm(false);
    setNewWsName('');
    setNewWsDesc('');
    setNewWsModel('text-embedding-3-small');
  };
  const createDialogRef = useFocusTrap(showCreateWsForm, closeCreateWorkspaceForm);

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
        embeddingModel: newWsModel,
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
    <motion.div
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative isolate flex w-48 shrink-0 flex-col bg-editorial-bg/60 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-0 after:w-px after:bg-editorial-border after:content-['']"
    >
      <nav className="pt-3.5" aria-label={t('sidebar.areaLabel')}>
        <div className="px-3">
          <SectionLabel icon={BookOpenText} label={t('sidebar.areaLabel')} />
        </div>
        <div className="space-y-1.5 pb-3 pt-2.5">
          {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => {
            const isActive = enabled;
            return (
              <AttachedSidebarTab
                key={id}
                active={isActive}
                disabled={!enabled}
                layoutId="dashboard-active-area-tab"
                ariaCurrent={isActive ? 'page' : undefined}
                size="area"
                icon={(
                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                    isActive
                      ? 'border-editorial-accent/45 bg-editorial-accent/10 text-editorial-accent'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
                  }`}>
                    <Icon size={12} />
                  </span>
                )}
                label={t(`workspace.areas.${id}.title`)}
              />
            );
          })}
        </div>
      </nav>

      <div className="mx-3 mb-3 mt-1 h-px bg-editorial-border/60" aria-hidden="true" />

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 flex items-center justify-between gap-2">
          <SectionLabel icon={Archive} label={t('sidebar.workspaceSection')} />
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
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar space-y-1.5 pb-4 pt-2.5">
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspace?.id;
            return (
              <AttachedSidebarTab
                key={ws.id}
                active={isActive}
                layoutId="dashboard-active-workspace-tab"
                onClick={() => void handleSwitchWorkspace(ws)}
                ariaCurrent={isActive ? 'page' : undefined}
                icon={(
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-200 ${
                      isActive
                        ? 'bg-editorial-accent'
                        : 'border border-editorial-border bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                )}
                label={ws.name}
              />
            );
          })}
        </div>
      </section>

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
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
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
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
                  {t('workspace.descriptionLabel')}
                </span>
                <textarea
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  placeholder={t('workspace.descriptionPlaceholder')}
                  className="min-h-16 w-full rounded-[14px] border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
                  {t('workspace.embeddingModel')}
                </span>
                <select
                  value={newWsModel}
                  onChange={(e) => setNewWsModel(e.target.value as EmbeddingModel)}
                  className="w-full rounded-[14px] border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <option value="text-embedding-3-small">text-embedding-3-small</option>
                  <option value="text-embedding-3-large">text-embedding-3-large</option>
                </select>
              </label>
            </div>
          </EditorialModalShell>
        </div>
      )}
    </motion.div>
  );
}

interface AttachedSidebarTabProps {
  active: boolean;
  ariaCurrent?: 'page';
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  layoutId: string;
  onClick?: () => void;
  size?: 'area' | 'workspace';
}

function AttachedSidebarTab({
  active,
  ariaCurrent,
  disabled = false,
  icon,
  label,
  layoutId,
  onClick,
  size = 'workspace',
}: AttachedSidebarTabProps) {
  const labelClassName = size === 'area'
    ? 'font-display text-sm italic'
    : 'font-sans text-sm';
  const minHeightClassName = size === 'area' ? 'min-h-16' : 'min-h-[3.25rem]';
  const sharedButtonClassName = `relative z-10 flex w-full items-center gap-2 rounded-l-[20px] rounded-r-none px-3.5 py-2.5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${minHeightClassName}`;

  return (
    <div className={`relative pl-3 pr-0 ${active ? 'z-20' : 'z-10'}`}>
      {active ? (
        <motion.div
          layoutId={layoutId}
          transition={ATTACHED_TAB_TRANSITION}
          className="dashboard-sidebar-tab-surface absolute inset-y-0 left-2 right-0 z-0"
        />
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-current={ariaCurrent}
        className={`${sharedButtonClassName} ${
          active
            ? 'text-editorial-ink'
            : disabled
              ? 'cursor-not-allowed text-editorial-muted opacity-55'
              : 'text-editorial-muted hover:text-editorial-accent'
        }`}
      >
        {icon}
        <span className={`min-w-0 flex-1 truncate ${labelClassName} ${active ? 'text-editorial-ink' : ''}`}>
          {label}
        </span>
      </button>
    </div>
  );
}
