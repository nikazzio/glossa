import { ArrowDown, CheckCircle2, ChevronDown, CircleDashed, Eye, Loader, Pause, PauseCircle, Play, RefreshCw, RotateCcw, Square, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentExecutions, type SearchExecution, type SearchRun, relaunchSearch } from '../../services/federatedSearchService';
import { cancelJob, isTerminal, pauseJob, resumeJob } from '../../services/jobsService';
import type { IIIFProvider } from '../../types';
import { formatDateTime } from '../../utils';
import { Hint, IconButton, StatRow, Tooltip } from '../ui';
import { SEARCH_ERRORS } from '../dashboard/SourceDiscoveryPanel';

/** Lo stato di una fonte è un segno, non una parola: il nome sta nel suggerimento. */
function StateMark({ status }: { status: SearchExecution['job']['status'] }) {
  const { t } = useTranslation();
  const marks = {
    running: { icon: Loader, tone: 'text-editorial-running' },
    pausing: { icon: Loader, tone: 'text-editorial-running' },
    cancelling: { icon: Loader, tone: 'text-editorial-running' },
    queued: { icon: CircleDashed, tone: 'text-editorial-muted' },
    paused: { icon: PauseCircle, tone: 'text-editorial-muted' },
    error: { icon: XCircle, tone: 'text-editorial-danger' },
    cancelled: { icon: Square, tone: 'text-editorial-muted' },
    completed: { icon: CheckCircle2, tone: 'text-editorial-success' },
  } as const;
  const mark = marks[status] ?? marks.queued;
  const Icon = mark.icon;
  return (
    <Tooltip label={t(`jobs.status.${status}`)}>
      <span className={`shrink-0 ${mark.tone}`}>
        <Icon size={14} aria-label={t(`jobs.status.${status}`)} className={status === 'running' ? 'animate-pulse' : undefined} />
      </span>
    </Tooltip>
  );
}

/**
 * Una riga per fonte: segno di stato, nome, quanto è arrivato. Il resto — pagina,
 * esecuzione, copertura, comandi e tentativi precedenti — si apre cliccando.
 */
export function SearchExecutionPanel({ run, providers, busy, act, onViewExecution }: {
  run: SearchRun; providers: IIIFProvider[]; busy: boolean;
  act: (work: () => Promise<unknown>) => void;
  onViewExecution: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const executions = currentExecutions(run);
  const label = (key: string) => providers.find((provider) => provider.key === key)?.label ?? key;
  const filters = Object.entries(run.criteria)
    .filter(([key, value]) => key !== 'query' && value !== '' && value !== null)
    .map(([key, value]) => `${t(`federation.fields.${key}`)}: ${key === 'material' ? t(`federation.material.${value}`) : String(value)}`);

  return <div className="flex min-w-0 flex-col gap-3 p-3">
    <div className="flex items-center gap-1">
      <IconButton title={t('federation.pauseAll')} disabled={busy} size="sm"
        onClick={() => act(() => Promise.all(executions.filter((e) => ['queued','running'].includes(e.job.status)).map((e) => pauseJob(e.job.id))))}><Pause size={14} /></IconButton>
      <IconButton title={t('federation.resumeAll')} disabled={busy} size="sm"
        onClick={() => act(() => Promise.all(executions.filter((e) => e.job.status === 'paused').map((e) => resumeJob(e.job.id))))}><Play size={14} /></IconButton>
      <IconButton title={t('federation.retryFailed')} disabled={busy} size="sm"
        onClick={() => act(() => Promise.all(executions.filter((e) => e.job.status === 'error').map((e) => relaunchSearch(run.id,e.job.id,'retry'))))}><RotateCcw size={14} /></IconButton>
      {filters.length > 0 && <span className="ml-auto"><Hint label={`${t('federation.localHint')} — ${filters.join(' · ')}`} size="xs" /></span>}
    </div>

    <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
      {executions.map((execution) => {
        const job = execution.job;
        const terminal = isTerminal(job);
        const expanded = open === job.id;
        const previous = run.executions.filter((entry) => entry.providerKey === execution.providerKey);
        return <div key={job.id} className="min-w-0">
          <button type="button" aria-expanded={expanded} aria-controls={`execution-${job.id}`}
            onClick={() => setOpen(expanded ? null : job.id)}
            className="flex w-full min-w-0 items-center gap-2 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
            <StateMark status={job.status} />
            <span className="min-w-0 flex-1 truncate text-xs text-editorial-ink">{label(execution.providerKey)}</span>
            <span className="shrink-0 tabular-nums text-xs text-editorial-muted">{execution.received}</span>
            <ChevronDown size={14} className={`shrink-0 text-editorial-muted ${expanded ? '' : '-rotate-90'}`} aria-hidden />
          </button>

          <div id={`execution-${job.id}`} hidden={!expanded} className="min-w-0 space-y-2 pb-3">
            <dl className="space-y-1">
              <StatRow label={t('federation.pageLabel')} value={String(execution.page)} />
              <StatRow label={t('federation.receivedLabel')} value={String(execution.received)} />
              <StatRow label={t('federation.generationLabel')} value={String(execution.generation)} />
              {terminal && <StatRow label={t('federation.coverageLabel')}
                value={t(execution.hasMore ? 'federation.moreAvailable' : job.status === 'completed' ? 'federation.exhausted' : 'federation.partial')} />}
            </dl>
            {job.error && <p className="break-words text-xs text-editorial-danger" role="alert">{t(SEARCH_ERRORS[job.error] ?? job.error)}</p>}
            {job.waitingReason && <p className="text-xs text-editorial-muted">{t('federation.waiting')}</p>}
            <div className="flex flex-wrap gap-1">
              {(job.status === 'running' || job.status === 'queued') && <IconButton size="sm" title={t('jobs.pause')} disabled={busy} onClick={() => act(() => pauseJob(job.id))}><Pause size={13} /></IconButton>}
              {job.status === 'paused' && <IconButton size="sm" title={t('jobs.resume')} disabled={busy} onClick={() => act(() => resumeJob(job.id))}><Play size={13} /></IconButton>}
              {!terminal && <IconButton size="sm" title={t('jobs.cancel')} disabled={busy || job.status === 'cancelling'} onClick={() => act(() => cancelJob(job.id))}><Square size={13} /></IconButton>}
              {job.status === 'error' && <IconButton size="sm" title={t('federation.retry')} disabled={busy} onClick={() => act(() => relaunchSearch(run.id, job.id, 'retry'))}><RotateCcw size={13} /></IconButton>}
              {terminal && <IconButton size="sm" title={t('federation.restart')} disabled={busy} onClick={() => act(() => relaunchSearch(run.id, job.id, 'restart'))}><RefreshCw size={13} /></IconButton>}
              {job.status === 'completed' && execution.hasMore && <IconButton size="sm" title={t('dashboard.discovery.loadMore')} disabled={busy} onClick={() => act(() => relaunchSearch(run.id, job.id, 'continue'))}><ArrowDown size={13} /></IconButton>}
            </div>
            {previous.length > 1 && <div className="space-y-1">
              {previous.map((entry) => <div key={entry.job.id} className="flex min-w-0 items-center gap-2 text-xs text-editorial-muted">
                <StateMark status={entry.job.status} />
                <span className="min-w-0 flex-1 truncate">
                  {t('federation.generation', { count: entry.generation })}
                  {entry.job.createdAt ? ` · ${formatDateTime(entry.job.createdAt)}` : ''}
                </span>
                <IconButton title={t('federation.viewExecution')} onClick={() => onViewExecution(entry.job.id)} size="xs"><Eye size={13} /></IconButton>
              </div>)}
            </div>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
