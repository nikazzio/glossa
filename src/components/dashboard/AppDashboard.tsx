import { useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, BookOpenText, History, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { dashboardCounts, recentFacts, recentSources } from '../../services/dashboardService';
import { listProjectsNeedingAttention, listRecentProjectsAllWorkspaces } from '../../services/projectService';
import { useDashboardResource } from '../../hooks/useDashboardResource';
import { useFederatedSearch } from '../../hooks/useFederatedSearch';
import { searchStatus } from '../../services/federatedSearchService';
import { isTerminal } from '../../services/jobsService';
import { useJobsStore } from '../../stores/jobsStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { libraryLocation, translationsLocation, workspaceLocation } from '../../navigation/appLocation';
import { formatDateTime } from '../../utils';
import { DashboardSection } from './DashboardSection';
import { JobsOverviewChart } from './JobsOverviewChart';
import { EmptyState, FieldLabel, IconButton, Select, Spinner, StatBlock } from '../ui';

const recentProjects = (id: string | null) => listRecentProjectsAllWorkspaces(5, id);
const attentionProjects = (id: string | null) => listProjectsNeedingAttention(8, id);
const RECENT_SEARCHES = 5;

export function AppDashboard() {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const jobs = useJobsStore((s) => s.jobs);
  const [scope, setScope] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const counts = useDashboardResource(dashboardCounts, scope, revision);
  const sources = useDashboardResource(recentSources, scope, revision);
  const projects = useDashboardResource(recentProjects, scope, revision);
  const attention = useDashboardResource(attentionProjects, scope, revision);
  const facts = useDashboardResource(recentFacts, scope, revision);
  const searches = useFederatedSearch();
  const openJobs = () => { const ui = useUiStore.getState(); ui.setDrawerTab('jobs'); ui.setShowConsoleDrawer(true); };
  const openProject = async (id: string, workspaceId: string) => {
    try { await useProjectStore.getState().openProjectInWorkspace(id, workspaceId); }
    catch { toast.error(t('projects.openFailed')); }
  };
  /** Una sezione che non ha potuto leggere lo dice al suo posto: non diventa
   *  uno zero e non spegne le altre. */
  const sectionState = (state: { loading: boolean; error: boolean }) =>
    state.loading ? <Spinner size={16} />
      : state.error ? <p className="text-xs text-editorial-danger" role="alert">{t('dashboard.loadFailed')}</p>
        : null;
  const metrics = [
    { key: 'sources' as const, label: t('federation.catalog'), open: () => navigate(libraryLocation({ workspaceFilter: scope ?? undefined })) },
    { key: 'transcriptions' as const, label: t('overview.transcriptions'), open: null },
    { key: 'projects' as const, label: t('dashboard.stats.projects'), open: () => navigate(translationsLocation({ workspaceFilter: scope ?? undefined })) },
    { key: 'workspaces' as const, label: t('overview.workspaces'), open: scope ? () => navigate(workspaceLocation(scope)) : null },
  ];
  return <main className="h-full min-h-0 flex-1 overflow-y-auto bg-editorial-bg px-5 py-5 custom-scrollbar md:px-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{t('dashboard.title')}</h1>
      <div className="flex items-center gap-2">
        <Select value={scope ?? ''} onChange={(value) => setScope(value || null)} ariaLabel={t('overview.scope')}
          options={[{ value: '', label: t('overview.global') }, ...workspaces.map((w) => ({ value: w.id, label: w.name }))]} />
        <IconButton title={t('dashboard.refresh')} onClick={() => { setRevision((v) => v + 1); searches.refresh(); }}><RefreshCw size={16} /></IconButton>
        <IconButton title={t('federation.launch')} onClick={() => navigate(libraryLocation({ view: 'search' }))}><Search size={18} /></IconButton>
      </div>
    </header>

    <section className="my-4 grid grid-cols-2 gap-4 border-y border-editorial-border py-3 xl:grid-cols-4" aria-label={t('overview.patrimony')}>
      {metrics.map((metric) => <div key={metric.key} className="flex items-center justify-between gap-2">
        <StatBlock label={metric.label} value={counts.data ? String(counts.data[metric.key]) : '—'} />
        {metric.open && <IconButton title={t('dashboard.openArea', { area: metric.label })} onClick={metric.open}><ArrowRight size={16} /></IconButton>}
      </div>)}
      {sectionState(counts) && <div className="col-span-full">{sectionState(counts)}</div>}
    </section>

    <div className="grid items-start gap-4 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <DashboardSection id="resume" icon={History} label={t('dashboard.resumeTitle')} hint={t('overview.resumeHint')}>
          {sectionState(sources) ?? (sources.data?.length ? <>
            <FieldLabel block>{t('dashboard.resumeSources')}</FieldLabel>
            {sources.data.map((source) => <DashboardRow key={source.id} title={source.title}
              detail={formatDateTime(source.updated_at)} label={t('overview.openSource')}
              onOpen={() => navigate(libraryLocation({ itemId: source.id }))} />)}
          </> : null)}
          {sectionState(projects) ?? (projects.data?.length ? <>
            <FieldLabel block>{t('dashboard.resumeProjects')}</FieldLabel>
            {projects.data.map((project) => <DashboardRow key={project.id} title={project.name}
              detail={project.workspace_name} label={t('overview.openProject')}
              onOpen={() => void openProject(project.id, project.workspace_id)} />)}
          </> : null)}
          {sources.data?.length === 0 && projects.data?.length === 0 &&
            <EmptyState icon={<BookOpenText size={18} />} message={t('dashboard.resumeEmpty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection>

        <DashboardSection id="searches" icon={Search} label={t('federation.history')} hint={t('overview.searchGlobal')}>
          {searches.error
            ? <p role="alert" className="text-xs text-editorial-danger">{t('federation.readFailed')}</p>
            : searches.loading && !searches.runs.length
              ? <Spinner size={16} />
              : searches.runs.length
                ? <>
                  {searches.runs.slice(0, RECENT_SEARCHES).map((run) => <DashboardRow key={run.id} title={run.criteria.query}
                    detail={`${t('jobs.status.' + searchStatus(run))} · ${formatDateTime(run.createdAt)}`}
                    label={t('federation.open')} onOpen={() => navigate(libraryLocation({ view: 'search', searchId: run.id }))} />)}
                  <div className="flex justify-end pt-1">
                    <IconButton size="sm" title={t('federation.viewAll')} onClick={() => navigate(libraryLocation({ view: 'search' }))}><ArrowRight size={16} /></IconButton>
                  </div>
                </>
                : <EmptyState icon={<Search size={18} />} message={t('federation.empty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection>

        <DashboardSection id="activity" icon={Activity} label={t('dashboard.activityTitle')} hint={t('overview.activityHint')} initiallyOpen={false}>
          {sectionState(facts)}
          {facts.data?.map((fact) => <div key={fact.id} className="border-b border-editorial-border/60 py-2 last:border-0">
            <p className="text-sm text-editorial-ink">{t('overview.events.' + fact.event_type, { defaultValue: fact.event_type })}</p>
            <p className="truncate font-display italic text-editorial-muted">{fact.title ?? t('overview.entities.' + fact.entity_type, { defaultValue: fact.entity_type })}</p>
            <p className="text-xs text-editorial-muted">{formatDateTime(fact.occurred_at)}{fact.outcome ? ' · ' + t('overview.outcomes.' + fact.outcome, { defaultValue: fact.outcome }) : ''}</p>
          </div>)}
          {facts.data?.length === 0 && <EmptyState icon={<Activity size={18} />} message={t('dashboard.activityEmpty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <DashboardSection id="attention" icon={AlertTriangle} label={t('dashboard.attentionTitle')} hint={t('overview.attentionHint')}>
          {sectionState(attention)}
          {attention.data?.map((project) => <DashboardRow key={project.project_id} title={project.project_name}
            detail={`${project.workspace_name} · ${t('dashboard.attentionCount', { count: project.issue_count })}`}
            label={t('overview.openProject')} onOpen={() => void openProject(project.project_id, project.workspace_id)} />)}
          {attention.data?.length === 0 && <EmptyState icon={<AlertTriangle size={18} />} message={t('dashboard.attentionEmpty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection>

        <DashboardSection id="jobs" icon={Activity} label={t('dashboard.jobsTitle')} hint={t('overview.jobsHint')}>
          <JobsOverviewChart jobs={jobs} />
          <div className="flex items-center justify-between gap-3 border-t border-editorial-border pt-2.5">
            <p className="text-xs text-editorial-muted">{t('overview.jobsSummary', { active: jobs.filter((job) => !isTerminal(job)).length, failed: jobs.filter((job) => job.status === 'error').length })}</p>
            <IconButton size="sm" title={t('overview.openJobs')} onClick={openJobs}><Activity size={16} /></IconButton>
          </div>
        </DashboardSection>
      </div>
    </div>
  </main>;
}

const EMPTY_CLASSNAME = 'flex flex-col items-center gap-2 px-3 py-6 text-center';

function DashboardRow({ title, detail, label, onOpen }: { title: string; detail?: string; label: string; onOpen: () => void }) {
  return <div className="flex items-center justify-between gap-3 border-b border-editorial-border/60 py-2 last:border-0">
    <div className="min-w-0"><p className="truncate font-display italic text-editorial-ink">{title}</p>{detail && <p className="truncate text-xs text-editorial-muted">{detail}</p>}</div>
    <IconButton size="sm" title={label} onClick={onOpen}><ArrowRight size={16} /></IconButton>
  </div>;
}
