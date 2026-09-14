import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
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
import { dashboardLocation, libraryLocation, translationsLocation, workspaceLocation } from '../../navigation/appLocation';
import { formatDateTime } from '../../utils';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { DashboardBoard, type BoardSection } from './DashboardBoard';
import { DashboardSection } from './DashboardSection';
import { JobsOverviewChart } from './JobsOverviewChart';
import { JobsHistoryList } from '../jobs/JobsHistoryList';
import { EmptyState, FieldLabel, IconButton, InspectorShell, Select, Spinner, StatBlock, Tooltip } from '../ui';

const JOBS_COLLAPSED = 56;
const JOBS_MIN = 320;
const JOBS_MAX = 560;
const OVERVIEW_MIN = 420;

const recentProjects = (id: string | null) => listRecentProjectsAllWorkspaces(5, id);
const attentionProjects = (id: string | null) => listProjectsNeedingAttention(8, id);
const RECENT_SEARCHES = 5;

export function AppDashboard() {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const allJobs = useJobsStore((s) => s.jobs);
  const jobs = allJobs.filter((job) => job.jobType !== 'provider_search');
  const [scope, setScope] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const counts = useDashboardResource(dashboardCounts, scope, revision);
  const sources = useDashboardResource(recentSources, scope, revision);
  const projects = useDashboardResource(recentProjects, scope, revision);
  const attention = useDashboardResource(attentionProjects, scope, revision);
  const facts = useDashboardResource(recentFacts, scope, revision);
  // Il riquadro ne mostra cinque: chiederne cinquanta a ogni evento dei lavori
  // sarebbe dieci volte il lavoro per lo stesso schermo.
  const searches = useFederatedSearch(undefined, RECENT_SEARCHES);
  const jobsWidth = useUiStore((s) => s.dashboardJobsWidth);
  const jobsCollapsed = useUiStore((s) => s.dashboardJobsCollapsed);
  const setJobsWidth = useUiStore((s) => s.setDashboardJobsWidth);
  const setJobsCollapsed = useUiStore((s) => s.setDashboardJobsCollapsed);
  const [jobsPanel, setJobsPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  const initialJobsWidth = useRef(Math.min(Math.max(jobsWidth || 380, JOBS_MIN), JOBS_MAX));
  const persistJobsLayout = () => {
    if (!jobsPanel) return;
    const collapsed = jobsPanel.isCollapsed();
    if (collapsed !== jobsCollapsed) setJobsCollapsed(collapsed);
    if (!collapsed) {
      const px = Math.round(jobsPanel.getSize().inPixels);
      if (px !== jobsWidth) setJobsWidth(px);
    }
  };
  const toggleJobsCollapsed = (next: boolean) => {
    if (!jobsPanel) return;
    if (next) jobsPanel.collapse();
    else jobsPanel.expand();
    setJobsCollapsed(next);
  };
  // Alla riapertura la colonna torna com'era: lo stato persistito è la
  // sorgente, il riquadro fisico lo segue.
  useEffect(() => {
    if (!jobsPanel) return;
    if (jobsCollapsed && !jobsPanel.isCollapsed()) jobsPanel.collapse();
    if (!jobsCollapsed && jobsPanel.isCollapsed()) jobsPanel.expand();
  }, [jobsCollapsed, jobsPanel]);
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
  return <Group orientation="horizontal" className="flex h-full min-h-0 w-full min-w-0 flex-1" onLayoutChanged={persistJobsLayout}>
    <Panel id="dashboard-overview" minSize={OVERVIEW_MIN} className="flex min-w-0 flex-col">
    <main className="h-full min-h-0 overflow-y-auto bg-editorial-bg px-5 py-5 custom-scrollbar md:px-6">
    <header className="flex flex-wrap items-center justify-end gap-3">
      <div className="flex items-center gap-2">
        <Select value={scope ?? ''} onChange={(value) => setScope(value || null)} ariaLabel={t('overview.scope')}
          options={[{ value: '', label: t('overview.global') }, ...workspaces.map((w) => ({ value: w.id, label: w.name }))]} />
        <IconButton title={t('dashboard.refresh')} onClick={() => { setRevision((v) => v + 1); searches.refresh(); }}><RefreshCw size={16} /></IconButton>
        <IconButton title={t('federation.launch')} onClick={() => navigate(dashboardLocation({ view: 'search' }))}><Search size={18} /></IconButton>
      </div>
    </header>

    <section className="my-4 grid grid-cols-2 gap-4 border-y border-editorial-border py-3 xl:grid-cols-4" aria-label={t('overview.patrimony')}>
      {metrics.map((metric) => <div key={metric.key} className="flex items-center justify-between gap-2">
        <StatBlock label={metric.label} value={counts.data ? String(counts.data[metric.key]) : '—'} />
        {metric.open && <IconButton title={t('dashboard.openArea', { area: metric.label })} onClick={metric.open}><ArrowRight size={16} /></IconButton>}
      </div>)}
      {sectionState(counts) && <div className="col-span-full">{sectionState(counts)}</div>}
    </section>

    <DashboardBoard sections={[
      { id: 'resume', node: <DashboardSection id="resume" icon={History} label={t('dashboard.resumeTitle')} hint={t('overview.resumeHint')}>
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
          {(sources.data?.length ?? 0) === 0 && (projects.data?.length ?? 0) === 0 &&
            !sources.loading && !projects.loading && !sources.error && !projects.error &&
            <EmptyState icon={<BookOpenText size={18} />} message={t('dashboard.resumeEmpty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection> },
      { id: 'searches', node: <DashboardSection id="searches" icon={Search} label={t('federation.history')} hint={t('overview.searchGlobal')}>
          {searches.error
            ? <p role="alert" className="text-xs text-editorial-danger">{t('federation.readFailed')}</p>
            : searches.loading && !searches.runs.length
              ? <Spinner size={16} />
              : searches.runs.length
                ? <>
                  {searches.runs.slice(0, RECENT_SEARCHES).map((run) => <DashboardRow key={run.id} title={run.criteria.query}
                    detail={`${t('jobs.status.' + searchStatus(run))} · ${formatDateTime(run.createdAt)}`}
                    label={t('federation.open')} onOpen={() => navigate(dashboardLocation({ view: 'search', searchId: run.id }))} />)}
                  <div className="flex justify-end pt-1">
                    <IconButton size="sm" title={t('federation.viewAll')} onClick={() => navigate(dashboardLocation({ view: 'search' }))}><ArrowRight size={16} /></IconButton>
                  </div>
                </>
                : <EmptyState icon={<Search size={18} />} message={t('federation.empty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection> },
      { id: 'activity', node: <DashboardSection id="activity" icon={Activity} label={t('dashboard.activityTitle')} hint={t('overview.activityHint')} initiallyOpen={false}>
          {sectionState(facts)}
          {facts.data?.map((fact) => <div key={fact.id} className="border-b border-editorial-border/60 py-2 last:border-0">
            <p className="text-sm text-editorial-ink">{t('overview.events.' + fact.event_type, { defaultValue: fact.event_type })}</p>
            <p className="truncate font-display italic text-editorial-muted">{fact.title ?? t('overview.entities.' + fact.entity_type, { defaultValue: fact.entity_type })}</p>
            <p className="text-xs text-editorial-muted">{formatDateTime(fact.occurred_at)}{fact.outcome ? ' · ' + t('overview.outcomes.' + fact.outcome, { defaultValue: fact.outcome }) : ''}</p>
          </div>)}
          {facts.data?.length === 0 && <EmptyState icon={<Activity size={18} />} message={t('dashboard.activityEmpty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection> },
      { id: 'attention', node: <DashboardSection id="attention" icon={AlertTriangle} label={t('dashboard.attentionTitle')} hint={t('overview.attentionHint')}>
          {sectionState(attention)}
          {attention.data?.map((project) => <DashboardRow key={project.project_id} title={project.project_name}
            detail={`${project.workspace_name} · ${t('dashboard.attentionCount', { count: project.issue_count })}`}
            label={t('overview.openProject')} onOpen={() => void openProject(project.project_id, project.workspace_id)} />)}
          {attention.data?.length === 0 && <EmptyState icon={<AlertTriangle size={18} />} message={t('dashboard.attentionEmpty')} className={EMPTY_CLASSNAME} />}
        </DashboardSection> },
      { id: 'jobs', node: <DashboardSection id="jobs" icon={Activity} label={t('dashboard.jobsTitle')} hint={t('overview.jobsHint')}>
          <JobsOverviewChart jobs={jobs} />
          <div className="flex items-center justify-between gap-3 border-t border-editorial-border pt-2.5">
            <p className="text-xs text-editorial-muted">{t('overview.jobsSummary', { active: jobs.filter((job) => !isTerminal(job)).length, failed: jobs.filter((job) => job.status === 'error').length })}</p>
            <IconButton size="sm" title={t('overview.openJobs')} onClick={openJobs}><Activity size={16} /></IconButton>
          </div>
        </DashboardSection> },
    ] satisfies BoardSection[]} />
    </main>
    </Panel>

    <Separator
      onPointerDown={() => setDragging(true)}
      className={`group/sep relative z-10 flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
        dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative h-7 w-px rounded-full transition-colors ${
          dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
        }`}
      />
    </Separator>

    <Panel
      id="dashboard-jobs"
      collapsible
      collapsedSize={JOBS_COLLAPSED}
      minSize={JOBS_MIN}
      maxSize={JOBS_MAX}
      defaultSize={initialJobsWidth.current}
      panelRef={setJobsPanel}
      onResize={persistJobsLayout}
      className={`flex min-w-0 flex-col border-l border-editorial-border bg-surface-panel ${
        dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
      }`}
    >
      <InspectorShell
        ariaLabel={t('jobsHistory.title')}
        tabs={[]}
        activeTab=""
        onTabChange={() => undefined}
        panelIcon={<Activity size={15} />}
        panelLabel={t('jobsHistory.title')}
        collapsed={jobsCollapsed}
        onCollapsedChange={toggleJobsCollapsed}
        ownsPanelSemantics={false}
        collapsedContent={
          /* Chiusa, la striscia dice comunque cosa nasconde: senza il segno
             resterebbe un bordo muto accanto al comando di riapertura. */
          <Tooltip label={t('jobsHistory.title')} side="left">
            <span className="text-editorial-muted" role="img" aria-label={t('jobsHistory.title')}>
              <Activity size={15} />
            </span>
          </Tooltip>
        }
      >
        <JobsHistoryList />
      </InspectorShell>
    </Panel>
  </Group>;
}

const EMPTY_CLASSNAME = 'flex flex-col items-center gap-2 px-3 py-6 text-center';

function DashboardRow({ title, detail, label, onOpen }: { title: string; detail?: string; label: string; onOpen: () => void }) {
  return <div className="flex items-center justify-between gap-3 border-b border-editorial-border/60 py-2 last:border-0">
    <div className="min-w-0"><p className="truncate font-display italic text-editorial-ink">{title}</p>{detail && <p className="truncate text-xs text-editorial-muted">{detail}</p>}</div>
    <IconButton size="sm" title={label} onClick={onOpen}><ArrowRight size={16} /></IconButton>
  </div>;
}
