import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpenText,
  CalendarDays,
  Database,
  FolderOpen,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { relativeDateUnit } from '../../utils';
import { IconButton, PillButton, SectionLabel } from '../ui';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';

export function WorkspaceHome() {
  const { t, i18n } = useTranslation();
  const { activeWorkspace, workspaces } = useWorkspaceStore();
  const {
    projects,
    loadProjects,
    createAndOpen,
    openProject,
    removeProject,
  } = useProjectStore();

  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [activeWorkspace?.id, loadProjects]);

  const formatRelative = (updatedAt: string) => {
    const unit = relativeDateUnit(updatedAt);
    if (unit.key === 'justNow') return t('projects.updatedJustNow');
    return t(`projects.updated${unit.key.charAt(0).toUpperCase()}${unit.key.slice(1)}`, {
      count: unit.count,
    });
  };

  const createdLabel = useMemo(() => {
    if (!activeWorkspace?.createdAt) return '—';
    return new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(activeWorkspace.createdAt));
  }, [activeWorkspace?.createdAt, i18n.language]);

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
    try {
      await openProject(projectId);
    } catch (err: unknown) {
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
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-editorial-bg px-5 py-5 custom-scrollbar md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 border-b border-editorial-border/60 pb-5 xl:border-b-0 xl:pb-0">
            <SectionLabel icon={BookOpenText} label={t('workspace.activeLabel')} />
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="font-display text-4xl italic tracking-tight text-editorial-ink md:text-5xl">
                  {activeWorkspace?.name ?? t('workspace.noActive')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                  {activeWorkspace?.description || t('workspace.translationBoundary')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <IconButton
                  size="md"
                  tone="accent"
                  onClick={() => setShowNewProjectForm(true)}
                  title={t('workspace.newBookCard')}
                  disabled={!activeWorkspace || showNewProjectForm}
                >
                  <Plus size={14} />
                </IconButton>
                <IconButton
                  size="md"
                  onClick={() => setShowWorkspaceSettings(true)}
                  title={t('workspace.configure')}
                  disabled={!activeWorkspace}
                >
                  <Settings2 size={14} />
                </IconButton>
              </div>
            </div>
          </div>

          <aside className="rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)] xl:rounded-r-[20px] xl:border-r">
            <SectionLabel icon={Database} label={t('workspace.technicalSummary')} />
            <dl className="mt-4 space-y-3">
              <TechRow label={t('workspace.projectsMetric')} value={String(projects.length)} />
              <TechRow label={t('workspace.workspacesMetric')} value={String(workspaces.length)} />
              <TechRow label={t('workspace.embeddingModel')} value={activeWorkspace?.embeddingModel ?? '—'} />
              <TechRow label={t('workspace.createdAt')} value={createdLabel} />
              <TechRow label={t('workspace.memoryScope')} value={t('workspace.workspaceScoped')} />
            </dl>
          </aside>
        </section>

        <section className="min-h-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel icon={FolderOpen} label={t('workspace.projectsTitle')} />
            {!showNewProjectForm && (
              <PillButton variant="accent" onClick={() => setShowNewProjectForm(true)}>
                <span className="inline-flex items-center gap-2">
                  <Plus size={13} />
                  {t('workspace.newBookCard')}
                </span>
              </PillButton>
            )}
          </div>

          {showNewProjectForm && (
            <div className="mb-4 rounded-[22px] border border-editorial-accent/45 bg-editorial-paper px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                  className="min-w-0 flex-1 rounded-full border border-editorial-border bg-editorial-bg/80 px-4 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  autoFocus
                />
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
              </div>
            </div>
          )}

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
                const relativeLabel = formatRelative(project.updated_at);
                return (
                  <article
                    key={project.id}
                    className="group rounded-[26px] border border-editorial-border bg-editorial-paper/75 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-colors duration-150 hover:border-editorial-accent/45 hover:bg-editorial-paper"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void handleOpenProject(project.id)}
                        className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      >
                        <span className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg/85 text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
                            <BookOpenText size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-xl italic text-editorial-ink">
                              {project.name}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-editorial-muted">
                              <span>{project.source_language}{' -> '}{project.target_language}</span>
                              <span aria-hidden="true">/</span>
                              <span>{relativeLabel}</span>
                            </span>
                          </span>
                        </span>
                      </button>
                      <IconButton
                        size="sm"
                        tone="muted"
                        onClick={() => void handleDeleteProject(project)}
                        title={`${t('projects.delete')} ${project.name}`}
                        ariaLabel={`${t('projects.delete')} ${project.name}`}
                        className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-[3.25rem] text-xs text-editorial-muted">
                      <span className="inline-flex items-center gap-1 rounded-full border border-editorial-border bg-editorial-bg/70 px-2.5 py-1">
                        <CalendarDays size={11} />
                        {new Intl.DateTimeFormat(i18n.language, { month: 'short', day: '2-digit' }).format(new Date(project.updated_at))}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-editorial-border bg-editorial-bg/70 px-2.5 py-1">
                        <Archive size={11} />
                        {t('workspace.areas.translations.title')}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <WorkspaceSettingsModal
        open={showWorkspaceSettings}
        onClose={() => setShowWorkspaceSettings(false)}
      />
    </main>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-editorial-border/45 pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.24em] text-editorial-muted">
        {label}
      </dt>
      <dd className="max-w-[12rem] truncate text-right font-mono text-xs text-editorial-ink">
        {value}
      </dd>
    </div>
  );
}
