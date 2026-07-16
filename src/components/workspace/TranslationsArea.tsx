import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowUpAZ, BookOpenText, Clock, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { Dialog, DialogCancelButton, DialogConfirmButton, IconButton } from '../ui';

type SortKey = 'updatedAt' | 'name';

export function TranslationsArea() {
  const { t, i18n } = useTranslation();
  const { activeWorkspace } = useWorkspaceStore();
  const { setActiveWorkspaceArea } = useUiStore();
  const { projects, loadProjects, createAndOpen, openProject, removeProject } = useProjectStore();

  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);

  const closeNewProjectForm = () => {
    setShowNewProjectForm(false);
    setNewProjectName('');
  };

  useEffect(() => { void loadProjects(); }, [activeWorkspace?.id, loadProjects]);
  useEffect(() => { setOpeningProjectId(null); }, [activeWorkspace?.id]);

  const sortedProjects = useMemo(() =>
    [...projects].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name)
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
    [projects, sortKey]
  );

  const formatSavedAt = (updatedAt: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(updatedAt));

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await createAndOpen(newProjectName.trim());
      setShowNewProjectForm(false);
      setNewProjectName('');
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const handleOpenProject = async (projectId: string) => {
    setOpeningProjectId(projectId);
    try {
      await openProject(projectId);
    } catch (err: unknown) {
      setOpeningProjectId(null);
      toast.error(t('projects.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteProject = async (project: { id: string; name: string }) => {
    const ok = await confirm({
      title: t('projects.confirmDeleteTitle'),
      message: t('projects.confirmDeleteMessage', { name: project.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeProject(project.id);
      toast.success(t('projects.deleted'));
    } catch (err: unknown) {
      toast.error(t('projects.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        {/* Back nav */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setActiveWorkspaceArea(null)}
            aria-label={t('workspace.translationsArea.backLabel', { name: activeWorkspace?.name ?? '' })}
            className="flex items-center gap-1.5 text-xs text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded-md"
          >
            <ArrowLeft size={11} />
            <span>{activeWorkspace?.name ?? t('workspace.noActive')}</span>
          </button>
        </div>

        {/* Header */}
        <div className="mb-5 flex items-end justify-between gap-3">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
            {t('workspace.areas.translations.title')}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {([
                { key: 'updatedAt' as SortKey, icon: Clock },
                { key: 'name' as SortKey, icon: ArrowUpAZ },
              ]).map(({ key, icon: Icon }) => (
                <IconButton
                  key={key}
                  size="md"
                  tone={sortKey === key ? 'accent' : 'default'}
                  onClick={() => setSortKey(key)}
                  title={t(`workspace.translationsArea.sort.${key}`)}
                  ariaPressed={sortKey === key}
                >
                  <Icon size={14} />
                </IconButton>
              ))}
              <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
              <span className="self-center font-display text-sm italic text-editorial-ink">
                {t(`workspace.translationsArea.sort.${sortKey}`)}
              </span>
            </div>
          </div>
        </div>

        {/* Grid — always shown, new project card always last */}
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {sortedProjects.map((project) => {
            const isOpening = openingProjectId === project.id;
            const isDimmed = openingProjectId !== null && !isOpening;
            return (
              <motion.article
                key={project.id}
                layout
                initial={false}
                animate={{ opacity: isDimmed ? 0.42 : 1, scale: isOpening ? 0.985 : 1, y: isOpening ? -2 : 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={`group relative overflow-hidden rounded-[26px] border bg-editorial-paper/75 px-4 py-3.5 shadow-[var(--inset-highlight)] transition-colors duration-150 ${
                  isOpening
                    ? 'border-editorial-accent/55 bg-editorial-paper'
                    : 'border-editorial-border hover:border-editorial-accent/45 hover:bg-editorial-paper'
                }`}
              >
                <AnimatePresence>
                  {isOpening ? (
                    <motion.span
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.12, ease: 'easeOut' }}
                      className="pointer-events-none absolute inset-0 bg-editorial-accent/8"
                      aria-hidden="true"
                    />
                  ) : null}
                </AnimatePresence>
                <div className="relative z-10 flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => void handleOpenProject(project.id)}
                    disabled={openingProjectId !== null}
                    aria-busy={isOpening}
                    className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-wait"
                  >
                    <span className="flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-editorial-bg/85 transition-colors ${
                        isOpening
                          ? 'border-editorial-accent/45 text-editorial-accent'
                          : 'border-editorial-border text-editorial-muted group-hover:border-editorial-accent/45 group-hover:text-editorial-accent'
                      }`}>
                        <BookOpenText size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-xl italic text-editorial-ink">
                          {project.name}
                        </span>
                        <span className="mt-1 block text-xs text-editorial-muted">
                          {formatSavedAt(project.updated_at)}
                        </span>
                        <span className="mt-2 block text-xs text-editorial-ink">
                          {t('workspace.pipelineBadge', { count: project.pipeline_count })}
                        </span>
                      </span>
                    </span>
                  </button>
                  <IconButton
                    size="sm" tone="muted"
                    onClick={() => void handleDeleteProject(project)}
                    title={`${t('projects.delete')} ${project.name}`}
                    disabled={openingProjectId !== null}
                    ariaLabel={`${t('projects.delete')} ${project.name}`}
                    className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              </motion.article>
            );
          })}
          {/* New project card */}
          <motion.button
            type="button"
            layout
            onClick={() => setShowNewProjectForm(true)}
            disabled={!activeWorkspace || showNewProjectForm}
            className="group flex min-h-[100px] w-full items-center justify-center gap-3 rounded-[26px] border border-dashed border-editorial-border bg-transparent transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('workspace.newBookCard')}
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-editorial-border text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
              <Plus size={16} />
            </span>
            <span className="font-display text-lg italic text-editorial-muted transition-colors group-hover:text-editorial-ink">
              {t('workspace.newBookCard')}
            </span>
          </motion.button>
        </div>
      </div>

      <Dialog
        open={showNewProjectForm}
        onOpenChange={(open) => {
          if (!open) closeNewProjectForm();
        }}
        title={t('projects.create')}
        eyebrow={activeWorkspace?.name ?? t('workspace.noActive')}
        closeLabel={t('common.cancel')}
        icon={<BookOpenText size={22} />}
        widthClassName="max-w-lg"
        bodyClassName="px-6 py-6 md:px-8"
        footer={
          <div className="flex justify-end gap-2">
            <DialogCancelButton onClick={closeNewProjectForm}>
              {t('common.cancel')}
            </DialogCancelButton>
            <DialogConfirmButton
              onClick={() => void handleCreateProject()}
              disabled={!newProjectName.trim() || creatingProject}
            >
              {creatingProject ? t('workspace.saving') : t('projects.create')}
            </DialogConfirmButton>
          </div>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
            {t('workspace.newBookCard')}
          </span>
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateProject();
              if (e.key === 'Escape') closeNewProjectForm();
            }}
            placeholder={t('projects.namePlaceholder')}
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (nuovo progetto)
            autoFocus
          />
        </label>
      </Dialog>
    </main>
  );
}
