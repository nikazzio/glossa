import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  Database,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton, SectionLabel } from '../ui';

export function WorkspaceHome() {
  const { t, i18n } = useTranslation();
  const { activeWorkspace } = useWorkspaceStore();
  const setShowSettings = useUiStore((state) => state.setShowSettings);
  const { statuses: keyStatuses, isLoading: keyStatusLoading } = useProviderKeyStatus();
  const {
    projects,
    loadProjects,
    createAndOpen,
    openProject,
    removeProject,
  } = useProjectStore();

  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const createProjectDialogRef = useFocusTrap(showNewProjectForm, () => {
    setShowNewProjectForm(false);
    setNewProjectName('');
  });

  useEffect(() => {
    void loadProjects();
  }, [activeWorkspace?.id, loadProjects]);

  useEffect(() => {
    setOpeningProjectId(null);
  }, [activeWorkspace?.id]);

  const formatProjectSavedAt = (updatedAt: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(updatedAt));

  const createdLabel = useMemo(() => {
    if (!activeWorkspace?.createdAt) return '—';
    return new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(activeWorkspace.createdAt));
  }, [activeWorkspace?.createdAt, i18n.language]);
  const hasRemoteProvider = Object.values(keyStatuses).some(Boolean);
  const shouldShowProviderBanner = !keyStatusLoading && !hasRemoteProvider;

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
      <div className="grid w-full flex-1 min-h-0 gap-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 px-5 py-5 md:px-6">
          <section className="min-w-0">
            <div className="flex flex-col gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
                  {activeWorkspace?.name ?? t('workspace.noActive')}
                </h1>
                {activeWorkspace?.description ? (
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                    {activeWorkspace.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
          </section>

          {shouldShowProviderBanner ? (
            <section className="mt-5 rounded-[20px] border border-editorial-accent/35 bg-editorial-accent/8 px-5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-editorial-accent/35 bg-editorial-paper text-editorial-accent">
                    <KeyRound size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-xl italic text-editorial-ink">
                      {t('workspace.providerBannerTitle')}
                    </p>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                      {t('workspace.providerBannerBody')}
                    </p>
                  </div>
                </div>
                <PillButton
                  variant="accent"
                  onClick={() => setShowSettings(true, 'provider')}
                  className="shrink-0"
                >
                  {t('workspace.providerBannerCta')}
                </PillButton>
              </div>
            </section>
          ) : null}

          <section className="mt-5 min-h-0">
            {projects.length === 0 ? (
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
                {projects.map((project) => {
                  const savedAtLabel = formatProjectSavedAt(project.updated_at);
                  const isOpening = openingProjectId === project.id;
                  const isDimmed = openingProjectId !== null && !isOpening;
                  return (
                    <motion.article
                      key={project.id}
                      layout
                      initial={false}
                      animate={{
                        opacity: isDimmed ? 0.42 : 1,
                        scale: isOpening ? 0.985 : 1,
                        y: isOpening ? -2 : 0,
                      }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className={`group relative overflow-hidden rounded-[26px] border bg-editorial-paper/75 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-colors duration-150 ${
                        isOpening
                          ? 'border-editorial-accent/55 bg-editorial-paper'
                          : 'border-editorial-border hover:border-editorial-accent/45 hover:bg-editorial-paper'
                      }`}
                    >
                      <AnimatePresence>
                        {isOpening ? (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
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
                                {savedAtLabel}
                              </span>
                              <span className="mt-2 block text-xs text-editorial-ink">
                                {t('workspace.pipelineBadge', { count: project.pipeline_count })}
                              </span>
                            </span>
                          </span>
                        </button>
                        <IconButton
                          size="sm"
                          tone="muted"
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
          </section>
        </div>

        <aside className="border-t border-editorial-border bg-editorial-bg/55 px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] xl:border-l xl:border-t-0">
          <SectionLabel icon={Database} label={t('workspace.technicalSummary')} />
          <dl className="mt-4 space-y-3">
            <TechRow label={t('workspace.projectsMetric')} value={String(projects.length)} />
            <TechRow label={t('workspace.pipelineMetric')} value={String(projects.reduce((total, project) => total + (project.pipeline_count ?? 0), 0))} />
            <TechRow label={t('workspace.embeddingModel')} value={activeWorkspace?.embeddingModel ?? '—'} />
            <TechRow label={t('workspace.createdAt')} value={createdLabel} />
            <TechRow label={t('workspace.memoryScope')} value={t('workspace.workspaceScoped')} />
          </dl>
        </aside>
      </div>

      <AnimatePresence>
        {showNewProjectForm ? (
          <div
            ref={createProjectDialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-editorial-ink/35 backdrop-blur-sm"
              onClick={() => {
                setShowNewProjectForm(false);
                setNewProjectName('');
              }}
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
                onClose={() => {
                  setShowNewProjectForm(false);
                  setNewProjectName('');
                }}
                icon={<BookOpenText size={22} />}
                widthClassName="max-w-lg"
                bodyClassName="px-6 py-6 md:px-8"
                footer={
                  <div className="flex justify-end gap-2">
                    <PillButton
                      onClick={() => {
                        setShowNewProjectForm(false);
                        setNewProjectName('');
                      }}
                    >
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
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                    {t('workspace.emptyProjectsBody')}
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
                      {t('workspace.newBookCard')}
                    </span>
                    <input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreateProject();
                        if (e.key === 'Escape') {
                          setShowNewProjectForm(false);
                          setNewProjectName('');
                        }
                      }}
                      placeholder={t('projects.namePlaceholder')}
                      className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      autoFocus
                    />
                  </label>
                </div>
              </EditorialModalShell>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-editorial-border/45 pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
        {label}
      </dt>
      <dd className="max-w-[12rem] truncate text-right font-mono text-xs text-editorial-ink">
        {value}
      </dd>
    </div>
  );
}
