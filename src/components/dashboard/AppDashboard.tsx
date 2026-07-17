import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  BookOpenText,
  History,
  KeyRound,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  countProjectsByWorkspace,
  listRecentPipelineRuns,
  listRecentProjectsAllWorkspaces,
  type RecentPipelineRun,
  type RecentProject,
  type WorkspaceProjectCount,
} from '../../services/projectService';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { IconButton, PillButton, SectionLabel, Spinner } from '../ui';
import { CreateWorkspaceDialog } from '../workspace/CreateWorkspaceDialog';

const RESUME_LIMIT = 5;
const ACTIVITY_LIMIT = 6;

/** Esiti delle esecuzioni pipeline: il registro chiude le run con success/warn/error. */
const RUN_TONE: Record<string, { dot: string; labelKey: string }> = {
  success: { dot: 'bg-editorial-success', labelKey: 'dashboard.runOutcome.success' },
  warn: { dot: 'bg-editorial-warning', labelKey: 'dashboard.runOutcome.warn' },
  error: { dot: 'bg-editorial-danger', labelKey: 'dashboard.runOutcome.error' },
};

const ROW_CLASS =
  'flex w-full cursor-pointer items-center justify-between gap-4 rounded-[16px] border border-editorial-border bg-editorial-bg/40 px-4 py-3 text-left transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent';

export function AppDashboard() {
  const { t, i18n } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const closeProject = useProjectStore((s) => s.closeProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const openProject = useProjectStore((s) => s.openProject);
  const setShowSettings = useUiStore((s) => s.setShowSettings);
  const setActiveWorkspaceView = useUiStore((s) => s.setActiveWorkspaceView);
  const { statuses: keyStatuses, isLoading: keyStatusLoading } = useProviderKeyStatus();

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentPipelineRun[]>([]);
  const [wsCounts, setWsCounts] = useState<WorkspaceProjectCount[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const [projects, runs, counts] = await Promise.all([
        listRecentProjectsAllWorkspaces(RESUME_LIMIT),
        listRecentPipelineRuns(ACTIVITY_LIMIT),
        countProjectsByWorkspace(),
      ]);
      setRecentProjects(projects);
      setRecentRuns(runs);
      setWsCounts(counts);
    } catch (err: unknown) {
      toast.error(t('dashboard.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData, activeWorkspace?.id, workspaces.length]);

  const configuredProviders = Object.entries(keyStatuses)
    .filter(([, ok]) => ok)
    .map(([id]) => id.charAt(0).toUpperCase() + id.slice(1));
  const shouldShowProviderBanner = !keyStatusLoading && configuredProviders.length === 0;

  const formatWhen = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));

  /** Apre un progetto da qualunque workspace: se serve, attiva prima il suo workspace. */
  const handleResume = async (project: RecentProject) => {
    try {
      if (project.workspace_id !== activeWorkspace?.id) {
        const ws = workspaces.find((w) => w.id === project.workspace_id);
        if (!ws) return;
        closeProject();
        await setActive(ws);
        await loadProjects();
      }
      await openProject(project.id);
    } catch (err: unknown) {
      toast.error(t('projects.openFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /** Naviga alla pagina del workspace (attivandolo se serve): il click ha sempre un effetto visibile. */
  const handleOpenWorkspace = async (workspaceId: string) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    if (ws.id !== activeWorkspace?.id) {
      closeProject();
      await setActive(ws);
      await loadProjects();
    }
    setActiveWorkspaceView('workspace');
  };

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="min-w-0 max-w-5xl px-5 py-5 md:px-6">
        {/* Header */}
        <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('dashboard.title')}
        </h1>

        {/* Provider mancante: unico alert della dashboard, sopra tutto */}
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
              <PillButton variant="accent" onClick={() => setShowSettings(true, 'provider')} className="shrink-0">
                {t('workspace.providerBannerCta')}
              </PillButton>
            </div>
          </section>
        ) : null}

        {/* Riprendi — cross-workspace */}
        <section className="mt-6">
          <div className="mb-2 px-1">
            <SectionLabel icon={History} label={t('dashboard.resumeTitle')} />
          </div>
          {isLoadingData ? (
            <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 px-1 py-2 text-xs text-editorial-muted" />
          ) : recentProjects.length > 0 ? (
            <div className="space-y-1.5">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => void handleResume(project)}
                  className={ROW_CLASS}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <BookOpenText size={14} className="shrink-0 text-editorial-muted" />
                    <span className="truncate font-display text-base italic text-editorial-ink">
                      {project.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-editorial-border bg-editorial-bg px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
                      {project.workspace_name}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-editorial-muted">
                    {formatWhen(project.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 text-sm text-editorial-muted">{t('dashboard.resumeEmpty')}</p>
          )}
        </section>

        {/* Attività recente — esecuzioni pipeline globali */}
        <section className="mt-6">
          <div className="mb-2 px-1">
            <SectionLabel icon={Activity} label={t('dashboard.activityTitle')} />
          </div>
          {isLoadingData ? (
            <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 px-1 py-2 text-xs text-editorial-muted" />
          ) : recentRuns.length > 0 ? (
            <div className="space-y-1.5">
              {recentRuns.map((run, i) => {
                const tone = RUN_TONE[run.level] ?? RUN_TONE.warn;
                return (
                  <div
                    key={`${run.at}-${i}`}
                    className="flex items-center justify-between gap-4 rounded-[16px] border border-editorial-border/60 bg-editorial-bg/30 px-4 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                      <span className="truncate text-sm text-editorial-ink">{t(tone.labelKey)}</span>
                      <span className="truncate font-display text-sm italic text-editorial-muted">
                        {run.project_name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-editorial-muted">{formatWhen(run.at)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-1 text-sm text-editorial-muted">{t('dashboard.activityEmpty')}</p>
          )}
        </section>

        {/* Workspace — righe che navigano alla pagina del workspace */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <SectionLabel icon={Archive} label={t('dashboard.workspacesTitle')} />
            <IconButton size="sm" tone="muted" onClick={() => setShowCreateDialog(true)} title={t('workspace.create')}>
              <Plus size={12} />
            </IconButton>
          </div>
          <div className="space-y-1.5">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspace?.id;
              const count = wsCounts.find((c) => c.workspace_id === ws.id);
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => void handleOpenWorkspace(ws.id)}
                  className={ROW_CLASS}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        isActive ? 'bg-editorial-accent' : 'border border-editorial-border bg-transparent'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate font-display text-base italic text-editorial-ink">{ws.name}</span>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
                      {t('workspace.projectsMetric', { count: count?.project_count ?? 0 })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-editorial-muted">
                    {count?.last_updated_at ? formatWhen(count.last_updated_at) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <CreateWorkspaceDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
    </main>
  );
}
