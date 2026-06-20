import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpenText, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton } from '../ui';

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

  const createProjectDialogRef = useFocusTrap(showNewProjectForm, () => {
    setShowNewProjectForm(false);
    setNewProjectName('');
  });

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
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveWorkspaceArea(null)}
            aria-label={activeWorkspace?.name ?? t('workspace.noActive')}
            className="flex items-center gap-1.5 text-xs text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded-md"
          >
            <ArrowLeft size={11} />
            {activeWorkspace?.name ?? t('workspace.noActive')}
          </button>
          <span className="text-xs text-editorial-border" aria-hidden="true">/</span>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-ink">
            {t('workspace.areas.translations.title')}
          </span>
        </div>

        {/* Header */}
        <div className="mb-5 flex items-end justify-between gap-3">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
            {t('workspace.areas.translations.title')}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5 rounded-[14px] border border-editorial-border bg-editorial-textbox/20 p-0.5">
              {(['updatedAt', 'name'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className={`rounded-[12px] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] transition-colors ${
                    sortKey === key
                      ? 'bg-editorial-paper text-editorial-ink shadow-sm'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  {t(`workspace.translationsArea.sort.${key}`)}
                </button>
              ))}
            </div>
            <IconButton
              size="md"
              onClick={() => setShowNewProjectForm(true)}
              title={t('workspace.newBookCard')}
              disabled={!activeWorkspace || showNewProjectForm}
              className="bg-editorial-textbox/25 hover:bg-editorial-textbox/45"
            >
              <Plus size={14} />
            </IconButton>
          </div>
        </div>

        {/* Grid */}
        {sortedProjects.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-editorial-border bg-editorial-paper/55 px-6 py-10 text-center">
            <p className="font-display text-3xl italic text-editorial-ink [text-wrap:balance]">
              {t('workspace.emptyProjectsTitle')}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
              {t('workspace.emptyProjectsBody')}
            </p>
          </div>
        ) : (
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
          </div>
        )}
      </div>

      {/* New project dialog */}
      <AnimatePresence>
        {showNewProjectForm ? (
          <div
            ref={createProjectDialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog" aria-modal="true" aria-labelledby="create-project-title"
          >
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-editorial-ink/35 backdrop-blur-sm"
              onClick={() => { setShowNewProjectForm(false); setNewProjectName(''); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="relative w-full max-w-lg"
            >
              <EditorialModalShell
                titleId="create-project-title"
                title={t('projects.create')}
                eyebrow={activeWorkspace?.name ?? t('workspace.noActive')}
                closeLabel={t('common.cancel')}
                onClose={() => { setShowNewProjectForm(false); setNewProjectName(''); }}
                icon={<BookOpenText size={22} />}
                widthClassName="max-w-lg"
                bodyClassName="px-6 py-6 md:px-8"
                footer={
                  <div className="flex justify-end gap-2">
                    <PillButton onClick={() => { setShowNewProjectForm(false); setNewProjectName(''); }}>
                      {t('common.cancel')}
                    </PillButton>
                    <PillButton
                      variant="accent"
                      onClick={() => void handleCreateProject()}
                      disabled={!newProjectName.trim() || creatingProject}
                    >
                      {creatingProject ? t('workspace.saving') : t('projects.create')}
                    </PillButton>
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
                      if (e.key === 'Escape') { setShowNewProjectForm(false); setNewProjectName(''); }
                    }}
                    placeholder={t('projects.namePlaceholder')}
                    className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    autoFocus
                  />
                </label>
              </EditorialModalShell>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
