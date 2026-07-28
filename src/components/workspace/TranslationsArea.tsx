import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpAZ, BookOpenText, Clock, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';
import { listAllProjects, type WorkspaceProject } from '../../services/projectService';
import { IconButton, Spinner } from '../ui';
import { CreateProjectDialog } from '../projects/CreateProjectDialog';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceIdentity } from './WorkspaceIdentity';

type SortKey = 'updatedAt' | 'name';

/** Area Traduzioni: tutti i progetti di TUTTI i workspace — a differenza della
 * pagina Workspace, che mostra solo i progetti del workspace attivo. */
export function TranslationsArea() {
  const { t, i18n } = useTranslation();
  const openProjectInWorkspace = useProjectStore((s) => s.openProjectInWorkspace);
  const removeProject = useProjectStore((s) => s.removeProject);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [allProjects, setAllProjects] = useState<WorkspaceProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);

  const loadAllProjects = useCallback(async () => {
    try {
      setAllProjects(await listAllProjects());
    } catch (err: unknown) {
      toast.error(t('dashboard.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadAllProjects(); }, [loadAllProjects]);

  const sortedProjects = useMemo(() =>
    [...allProjects].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name)
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
    [allProjects, sortKey]
  );

  const formatSavedAt = (updatedAt: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(updatedAt));

  const handleOpenProject = async (project: WorkspaceProject) => {
    setOpeningProjectId(project.id);
    try {
      await openProjectInWorkspace(project.id, project.workspace_id);
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
      await loadAllProjects();
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
        <div className="mb-5 flex items-end justify-between gap-3">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
            {t('areas.translations.title')}
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

        {isLoading ? (
          <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 px-1 py-2 text-xs text-editorial-muted" />
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {sortedProjects.map((project) => {
            const isOpening = openingProjectId === project.id;
            const isDimmed = openingProjectId !== null && !isOpening;
            const workspace = workspaces.find((item) => item.id === project.workspace_id);
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
                    onClick={() => void handleOpenProject(project)}
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
                        <span className="mt-1 flex items-center gap-2">
                          {workspace ? (
                            <WorkspaceIdentity workspace={workspace} iconOnly iconSize={14} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-textbox/30 text-editorial-muted" />
                          ) : <span className="sr-only">{project.workspace_name}</span>}
                          <span className="text-xs text-editorial-muted">
                            {formatSavedAt(project.updated_at)}
                          </span>
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
            disabled={showNewProjectForm}
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
        )}
      </div>

      <CreateProjectDialog open={showNewProjectForm} onClose={() => setShowNewProjectForm(false)} />
    </main>
  );
}
