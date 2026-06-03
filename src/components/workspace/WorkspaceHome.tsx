import { useEffect, useState } from 'react';
import {
  Archive,
  BookOpen,
  FileText,
  FolderOpen,
  LibraryBig,
  Plus,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { EmbeddingModel, Workspace } from '../../types';
import { relativeDateUnit } from '../../utils';
import { IconButton, SectionLabel } from '../ui';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';

type WorkspaceFormMode = 'closed' | 'create';
type AreaTab = 'translations' | 'library' | 'transcriptions';

const AREA_TABS: { id: AreaTab; icon: typeof FileText; enabled: boolean }[] = [
  { id: 'translations', icon: FileText, enabled: true },
  { id: 'library', icon: LibraryBig, enabled: false },
  { id: 'transcriptions', icon: BookOpen, enabled: false },
];

export function WorkspaceHome() {
  const { t } = useTranslation();
  const {
    activeWorkspace,
    workspaces,
    createAndActivate,
    setActive,
  } = useWorkspaceStore();
  const {
    projects,
    loadProjects,
    createAndOpen,
    openProject,
    removeProject,
    closeProject,
  } = useProjectStore();

  const [selectedArea, setSelectedArea] = useState<AreaTab>('translations');
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [workspaceFormMode, setWorkspaceFormMode] = useState<WorkspaceFormMode>('closed');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceEmbeddingModel, setWorkspaceEmbeddingModel] =
    useState<EmbeddingModel>('text-embedding-3-small');
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [activeWorkspace?.id, loadProjects]);

  const projectCount = projects.length;
  const formatRelative = (updatedAt: string) => {
    const unit = relativeDateUnit(updatedAt);
    if (unit.key === 'justNow') return t('projects.updatedJustNow');
    return t(`projects.updated${unit.key.charAt(0).toUpperCase()}${unit.key.slice(1)}`, {
      count: unit.count,
    });
  };

  const resetWorkspaceForm = () => {
    setWorkspaceFormMode('closed');
    setWorkspaceName('');
    setWorkspaceDescription('');
    setWorkspaceEmbeddingModel('text-embedding-3-small');
  };

  const startCreateWorkspace = () => {
    setWorkspaceFormMode('create');
    setWorkspaceName('');
    setWorkspaceDescription('');
    setWorkspaceEmbeddingModel('text-embedding-3-small');
  };

  const handleWorkspaceSubmit = async () => {
    if (!workspaceName.trim()) return;
    setSavingWorkspace(true);
    try {
      closeProject();
      await createAndActivate({
        name: workspaceName.trim(),
        description: workspaceDescription.trim() || undefined,
        embeddingModel: workspaceEmbeddingModel,
      });
      await loadProjects();
      toast.success(t('workspace.created'));
      resetWorkspaceForm();
    } catch (err: unknown) {
      toast.error(t('workspace.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingWorkspace(false);
    }
  };

  const handleSwitchWorkspace = async (workspace: Workspace) => {
    if (workspace.id === activeWorkspace?.id) return;
    closeProject();
    await setActive(workspace);
    await loadProjects();
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await createAndOpen(newProjectName.trim());
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreatingProject(false);
      setNewProjectName('');
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
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-editorial-bg px-5 py-6 md:px-8 custom-scrollbar">
      <div className="mx-auto w-full max-w-7xl">

        {/* Unified area panel: tab bar + content as one surface */}
        <div className="overflow-hidden rounded-[28px] border border-editorial-border shadow-[0_2px_16px_rgba(26,26,26,0.06)]">

          {/* Tab bar */}
          <div className="grid grid-cols-3 divide-x divide-editorial-border border-b border-editorial-border">
            {AREA_TABS.map(({ id, icon: Icon, enabled }) => {
              const isSelected = selectedArea === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && setSelectedArea(id)}
                  className={`relative flex flex-col gap-1.5 px-5 py-5 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-editorial-accent md:px-7 ${
                    isSelected
                      ? 'bg-editorial-accent/8'
                      : enabled
                        ? 'bg-editorial-bg/70 hover:bg-editorial-textbox/12'
                        : 'cursor-not-allowed bg-editorial-bg/40 opacity-40'
                  }`}
                >
                  {isSelected && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-editorial-accent" />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center justify-center rounded-full p-1.5 ${isSelected ? 'bg-editorial-accent/15 text-editorial-accent' : 'bg-editorial-textbox/25 text-editorial-muted'}`}>
                      <Icon size={13} />
                    </span>
                    <span className={`text-xs font-bold uppercase tracking-[0.2em] ${isSelected ? 'text-editorial-accent' : 'text-editorial-muted'}`}>
                      {enabled ? t('workspace.areaActive') : t('workspace.areaFuture')}
                    </span>
                  </div>
                  <h2 className={`font-display text-xl italic [text-wrap:balance] md:text-2xl ${isSelected ? 'text-editorial-ink' : 'text-editorial-muted'}`}>
                    {t(`workspace.areas.${id}.title`)}
                  </h2>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {selectedArea !== 'translations' ? (
            <div className="flex flex-col items-center justify-center bg-editorial-bg/50 px-8 py-24 text-center">
              {(() => {
                const area = AREA_TABS.find((a) => a.id === selectedArea)!;
                const Icon = area.icon;
                return (
                  <>
                    <div className="rounded-full border border-editorial-border bg-editorial-bg p-5 text-editorial-muted">
                      <Icon size={26} />
                    </div>
                    <h2 className="mt-6 font-display text-4xl italic text-editorial-ink [text-wrap:balance]">
                      {t(`workspace.areas.${selectedArea}.title`)}
                    </h2>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                      {t(`workspace.areas.${selectedArea}.body`)}
                    </p>
                    <span className="mt-6 rounded-full border border-editorial-border px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-editorial-muted">
                      Glossa 2.0
                    </span>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="bg-editorial-accent/8 px-6 py-7 md:px-8">

              {/* Workspace identity */}
              <div className="flex flex-col gap-5 border-b border-editorial-border/40 pb-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-editorial-muted">
                    {t('workspace.activeLabel')}
                  </p>
                  <h1 className="mt-2 font-display text-4xl italic tracking-tight text-editorial-ink [text-wrap:balance] md:text-5xl">
                    {activeWorkspace?.name ?? t('workspace.noActive')}
                  </h1>
                  <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                    {activeWorkspace?.description || t('workspace.translationBoundary')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <IconButton
                    size="md"
                    onClick={() => setShowWorkspaceSettings(true)}
                    title={t('workspace.configure')}
                    disabled={!activeWorkspace}
                  >
                    <Settings2 size={14} />
                  </IconButton>
                  <IconButton
                    size="md"
                    onClick={startCreateWorkspace}
                    title={t('workspace.create')}
                  >
                    <Plus size={14} />
                  </IconButton>
                </div>
              </div>

              {/* Metrics */}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricCard label={t('workspace.projectsMetric')} value={String(projectCount)} />
                <MetricCard label={t('workspace.embeddingModel')} value={activeWorkspace?.embeddingModel ?? '—'} />
                <MetricCard label={t('workspace.workspacesMetric')} value={String(workspaces.length)} />
              </div>

              {/* Projects + sidebar */}
              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">

                {/* Projects */}
                <section className="space-y-4 rounded-[20px] border border-editorial-border/60 bg-editorial-bg/65 px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SectionLabel icon={FolderOpen} label={t('workspace.projectsTitle')} />
                    <div className="flex min-w-[13rem] flex-1 items-center gap-2 sm:max-w-sm">
                      <input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleCreateProject();
                        }}
                        placeholder={t('projects.namePlaceholder')}
                        className="min-w-0 flex-1 rounded-full border border-editorial-border bg-editorial-textbox/35 px-4 py-2 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      />
                      <IconButton
                        size="md"
                        tone="accent"
                        onClick={() => void handleCreateProject()}
                        title={t('projects.create')}
                        disabled={!newProjectName.trim() || creatingProject}
                      >
                        {creatingProject ? <Save size={14} /> : <Plus size={14} />}
                      </IconButton>
                    </div>
                  </div>

                  {projects.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-editorial-border px-5 py-10 text-center">
                      <p className="font-display text-2xl italic text-editorial-ink [text-wrap:balance]">
                        {t('workspace.emptyProjectsTitle')}
                      </p>
                      <p className="mt-2 text-sm text-editorial-muted [text-wrap:pretty]">
                        {t('workspace.emptyProjectsBody')}
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {projects.map((project) => {
                        const relativeLabel = formatRelative(project.updated_at);
                        return (
                          <article
                            key={project.id}
                            className="group rounded-[16px] border border-editorial-border bg-editorial-textbox/10 px-4 py-3.5 transition-colors duration-150 hover:border-editorial-accent/40 hover:bg-editorial-textbox/20"
                          >
                            <button
                              type="button"
                              onClick={() => void handleOpenProject(project.id)}
                              className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                            >
                              <div className="flex items-start gap-3">
                                <FolderOpen size={14} className="mt-1 shrink-0 text-editorial-muted" />
                                <div className="min-w-0 flex-1">
                                  <h3 className="truncate font-display text-lg italic text-editorial-ink">
                                    {project.name}
                                  </h3>
                                  <p className="mt-0.5 font-mono text-xs tabular-nums text-editorial-muted">
                                    {project.source_language} → {project.target_language} · {relativeLabel}
                                  </p>
                                </div>
                              </div>
                            </button>
                            <div className="mt-3 flex justify-end">
                              <IconButton
                                size="sm"
                                tone="accent"
                                onClick={() => void handleDeleteProject(project)}
                                title={`${t('projects.delete')} ${project.name}`}
                                ariaLabel={`${t('projects.delete')} ${project.name}`}
                              >
                                <Trash2 size={12} />
                              </IconButton>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Sidebar: workspace switcher */}
                <aside>
                  <section className="rounded-[20px] border border-editorial-border/60 bg-editorial-bg/65 px-5 py-5">
                    <SectionLabel icon={Archive} label={t('workspace.switcherTitle')} />
                    <div className="mt-4 space-y-2">
                      {workspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => void handleSwitchWorkspace(workspace)}
                          className={`w-full rounded-[14px] border px-4 py-2.5 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                            workspace.id === activeWorkspace?.id
                              ? 'border-editorial-accent bg-editorial-accent/8'
                              : 'border-editorial-border bg-editorial-textbox/10 hover:border-editorial-accent/40'
                          }`}
                        >
                          <span className="block truncate font-display text-lg italic text-editorial-ink">
                            {workspace.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-xs tabular-nums text-editorial-muted">
                            {workspace.embeddingModel}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Create workspace inline form */}
      {workspaceFormMode !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-editorial-border bg-editorial-bg px-6 py-6 shadow-[0_24px_80px_rgba(26,26,26,0.18)]">
            <SectionLabel icon={Settings2} label={t('workspace.create')} />
            <div className="mt-5 space-y-4">
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder={t('workspace.namePlaceholder')}
                className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                autoFocus
              />
              <textarea
                value={workspaceDescription}
                onChange={(e) => setWorkspaceDescription(e.target.value)}
                placeholder={t('workspace.descriptionPlaceholder')}
                className="min-h-24 w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              />
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-editorial-muted">
                  {t('workspace.embeddingModel')}
                </span>
                <select
                  value={workspaceEmbeddingModel}
                  onChange={(e) => setWorkspaceEmbeddingModel(e.target.value as EmbeddingModel)}
                  className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <option value="text-embedding-3-small">text-embedding-3-small</option>
                  <option value="text-embedding-3-large">text-embedding-3-large</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetWorkspaceForm}
                className="rounded-full border border-editorial-border px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors duration-150 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleWorkspaceSubmit()}
                disabled={!workspaceName.trim() || savingWorkspace}
                className="rounded-full border border-editorial-accent bg-editorial-accent px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition-colors duration-150 hover:bg-editorial-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingWorkspace ? t('workspace.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <WorkspaceSettingsModal
        open={showWorkspaceSettings}
        onClose={() => setShowWorkspaceSettings(false)}
      />
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-editorial-border/60 bg-editorial-bg/65 px-4 py-4">
      <div className="text-xs font-bold uppercase tracking-[0.25em] text-editorial-muted">{label}</div>
      <div className="mt-2 truncate font-display text-2xl italic tabular-nums text-editorial-ink">{value}</div>
    </div>
  );
}
