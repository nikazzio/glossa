import { useState } from 'react';
import { Archive, BookOpenText, LibraryBig, Mic2, Plus } from 'lucide-react';
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
  { id: 'transcriptions', icon: Mic2, enabled: false },
] as const;

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
    <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-editorial-border bg-editorial-bg/60 custom-scrollbar">
      <nav className="px-3 pt-4" aria-label={t('sidebar.areaLabel')}>
        <SectionLabel icon={BookOpenText} label={t('sidebar.areaLabel')} />
        <div className="mt-3 space-y-1.5">
          {AREA_ITEMS.map(({ id, icon: Icon, enabled }) => (
            <button
              key={id}
              type="button"
              disabled={!enabled}
              aria-current={enabled ? 'page' : undefined}
              className={`w-full rounded-[14px] border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                enabled
                  ? 'border-editorial-accent/45 bg-editorial-paper text-editorial-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]'
                  : 'cursor-not-allowed border-editorial-border/70 bg-editorial-bg/45 text-editorial-muted opacity-55'
              }`}
            >
              <span className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    enabled
                      ? 'border-editorial-accent/45 bg-editorial-accent/10 text-editorial-accent'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted'
                  }`}
                >
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base italic">
                    {t(`workspace.areas.${id}.title`)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-editorial-muted">
                    {t(`workspace.areas.${id}.sidebarHint`)}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-3 my-4 h-px bg-editorial-border/60" />

      <section className="flex min-h-0 flex-1 flex-col px-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel icon={Archive} label={t('sidebar.workspaceSection')} />
          <IconButton
            size="sm"
            onClick={() => setShowCreateWsForm(true)}
            title={t('workspace.create')}
          >
            <Plus size={11} />
          </IconButton>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5 custom-scrollbar">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => void handleSwitchWorkspace(ws)}
              aria-current={ws.id === activeWorkspace?.id ? 'page' : undefined}
              className={`w-full px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                ws.id === activeWorkspace?.id
                  ? '-mr-3 rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper text-editorial-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]'
                  : 'rounded-[12px] border border-editorial-border bg-editorial-bg/70 text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    ws.id === activeWorkspace?.id ? 'bg-editorial-accent' : 'border border-editorial-border'
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base italic">{ws.name}</span>
                  {ws.description ? (
                    <span className="mt-0.5 block truncate text-xs text-editorial-muted/75">
                      {ws.description}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
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
            eyebrow={t('sidebar.workspaceSection')}
            closeLabel={t('common.cancel')}
            onClose={closeCreateWorkspaceForm}
            widthClassName="max-w-md"
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
    </div>
  );
}
