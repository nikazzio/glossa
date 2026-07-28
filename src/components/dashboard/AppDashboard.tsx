import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, BookMarked, BookOpenText, Brain, CheckCircle2, FolderOpen, History, KeyRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  getDashboardOverviewStats,
  listProjectsNeedingAttention,
  listRecentPipelineRuns,
  listRecentProjectsAllWorkspaces,
  type DashboardOverviewStats,
  type ProjectNeedingAttention,
  type RecentPipelineRun,
  type RecentProject,
} from '../../services/projectService';
import { countGlossaryEntries } from '../../services/glossaryService';
import { countPhraseMemoryEntries } from '../../services/phraseMemoryService';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { IconButton, SectionLabel, Spinner } from '../ui';
import { WorkspaceIdentity } from '../workspace/WorkspaceIdentity';
import { SourceDiscoveryPanel } from './SourceDiscoveryPanel';

const RESUME_LIMIT = 5;
const ACTIVITY_LIMIT = 6;
const ATTENTION_LIMIT = 8;

interface OverviewStats extends DashboardOverviewStats {
  totalPhrases: number;
  totalGlossaryTerms: number;
}

const EMPTY_OVERVIEW: OverviewStats = {
  totalProjects: 0, totalChunks: 0, completedChunks: 0, totalPhrases: 0, totalGlossaryTerms: 0,
};

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
  const openProjectInWorkspace = useProjectStore((s) => s.openProjectInWorkspace);
  const setShowSettings = useUiStore((s) => s.setShowSettings);
  const { statuses: keyStatuses, isLoading: keyStatusLoading } = useProviderKeyStatus();

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentPipelineRun[]>([]);
  const [attentionProjects, setAttentionProjects] = useState<ProjectNeedingAttention[]>([]);
  const [overview, setOverview] = useState<OverviewStats>(EMPTY_OVERVIEW);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const loadDashboardData = useCallback(async () => {
    try {
      const [projects, runs, attention, overviewStats, totalPhrases, totalGlossaryTerms] = await Promise.all([
        listRecentProjectsAllWorkspaces(RESUME_LIMIT),
        listRecentPipelineRuns(ACTIVITY_LIMIT),
        listProjectsNeedingAttention(ATTENTION_LIMIT),
        getDashboardOverviewStats(),
        countPhraseMemoryEntries(),
        countGlossaryEntries(),
      ]);
      setRecentProjects(projects);
      setRecentRuns(runs);
      setAttentionProjects(attention);
      setOverview({ ...overviewStats, totalPhrases, totalGlossaryTerms });
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
  const handleOpenProject = async (projectId: string, workspaceId: string) => {
    try {
      await openProjectInWorkspace(projectId, workspaceId);
    } catch (err: unknown) {
      toast.error(t('projects.openFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const overviewTiles = [
    { key: 'projects', icon: FolderOpen, label: t('dashboard.stats.projects'), value: String(overview.totalProjects) },
    { key: 'chunks', icon: CheckCircle2, label: t('dashboard.stats.chunks'), value: t('dashboard.stats.chunksValue', { completed: overview.completedChunks, total: overview.totalChunks }) },
    { key: 'phrases', icon: Brain, label: t('dashboard.stats.phrases'), value: String(overview.totalPhrases) },
    { key: 'glossary', icon: BookMarked, label: t('dashboard.stats.glossaryTerms'), value: String(overview.totalGlossaryTerms) },
  ];

  const workspaceIdentity = (workspaceId: string, workspaceName: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    return workspace
      ? <WorkspaceIdentity workspace={workspace} iconOnly iconSize={14} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-textbox/30 text-editorial-muted" />
      : <span className="sr-only">{workspaceName}</span>;
  };

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="w-full min-w-0 px-5 py-5 md:px-6">
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
              <IconButton onClick={() => setShowSettings(true, 'provider')} title={t('workspace.providerBannerCta')} className="shrink-0">
                <KeyRound size={15} />
              </IconButton>
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
          <SourceDiscoveryPanel />
          <aside className="min-w-0 space-y-6">
        {/* Richiede attenzione — frammenti con giudizio scarso/critico o problemi aperti */}
        <section>
          <div className="mb-2 px-1">
            <SectionLabel icon={AlertTriangle} label={t('dashboard.attentionTitle')} />
          </div>
          {isLoadingData ? (
            <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 px-1 py-2 text-xs text-editorial-muted" />
          ) : attentionProjects.length > 0 ? (
            <div className="space-y-1.5">
              {attentionProjects.map((project) => (
                <button
                  key={project.project_id}
                  type="button"
                  onClick={() => void handleOpenProject(project.project_id, project.workspace_id)}
                  className={`${ROW_CLASS} flex-col items-start gap-1.5`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <BookOpenText size={14} className="shrink-0 text-editorial-muted" />
                    <span className="truncate font-display text-base italic text-editorial-ink">
                      {project.project_name}
                    </span>
                    {workspaceIdentity(project.workspace_id, project.workspace_name)}
                  </span>
                  <span className="pl-7 text-xs text-editorial-warning">
                    {t('dashboard.attentionCount', { count: project.issue_count })}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 text-sm text-editorial-muted">{t('dashboard.attentionEmpty')}</p>
          )}
        </section>

        {/* Riprendi — cross-workspace */}
        <section>
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
                  onClick={() => void handleOpenProject(project.id, project.workspace_id)}
                  className={`${ROW_CLASS} flex-col items-start gap-1.5`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <BookOpenText size={14} className="shrink-0 text-editorial-muted" />
                    <span className="truncate font-display text-base italic text-editorial-ink">
                      {project.name}
                    </span>
                    {workspaceIdentity(project.workspace_id, project.workspace_name)}
                  </span>
                  <span className="pl-7 text-xs text-editorial-muted">
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
        <section>
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

          <section className="grid content-start grid-cols-2 gap-3 xl:grid-cols-1">
            {overviewTiles.map(({ key, icon: Icon, label, value }) => (
              <div key={key} className="rounded-[20px] border border-editorial-border bg-surface-elevated px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
                  <Icon size={12} className="shrink-0" />
                  {label}
                </div>
                <div className="mt-1.5 font-display text-2xl italic text-editorial-ink">{value}</div>
              </div>
            ))}
          </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
