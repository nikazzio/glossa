import { ArrowDown, Eye, Info, Pause, Play, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentExecutions, type SearchRun, relaunchSearch } from '../../services/federatedSearchService';
import { cancelJob, isTerminal, pauseJob, resumeJob } from '../../services/jobsService';
import type { IIIFProvider } from '../../types';
import { formatDateTime } from '../../utils';
import { IconButton, SectionLabel, StatBlock } from '../ui';
import { SEARCH_ERRORS } from '../dashboard/SourceDiscoveryPanel';

export function SearchExecutionPanel({ run, providers, busy, act, onViewExecution }: {
  run: SearchRun; providers: IIIFProvider[]; busy: boolean;
  act: (work: () => Promise<unknown>) => void;
  onViewExecution: (id: string) => void;
}) {
  const { t } = useTranslation();
  return <div className="space-y-5 p-4">
    <StatBlock label={t('federation.criteria')} value={run.criteria.query} />
    <div className="flex items-center gap-1">
      <IconButton title={t('federation.pauseAll')} disabled={busy} onClick={() => act(() => Promise.all(currentExecutions(run).filter((e) => ['queued','running'].includes(e.job.status)).map((e) => pauseJob(e.job.id))))}><Pause size={14} /></IconButton>
      <IconButton title={t('federation.resumeAll')} disabled={busy} onClick={() => act(() => Promise.all(currentExecutions(run).filter((e) => e.job.status === 'paused').map((e) => resumeJob(e.job.id))))}><Play size={14} /></IconButton>
      <IconButton title={t('federation.retryFailed')} disabled={busy} onClick={() => act(() => Promise.all(currentExecutions(run).filter((e) => e.job.status === 'error').map((e) => relaunchSearch(run.id,e.job.id,'retry'))))}><RotateCcw size={14} /></IconButton>
    </div>
    <div className="flex items-center gap-1.5">
      <SectionLabel icon={Info} label={t('federation.localGroup')} />
      <IconButton title={t('federation.localHint')} size="xs"><Info size={13} /></IconButton>
    </div>
    {Object.entries(run.criteria).filter(([key, value]) => key !== 'query' && value !== '' && value !== null).map(([key, value]) => (
      <StatBlock key={key} label={t(`federation.fields.${key}`)} value={key === 'material' ? t(`federation.material.${value}`) : String(value)} />
    ))}
    {currentExecutions(run).map((execution) => {
      const job = execution.job;
      const terminal = isTerminal(job);
      return <section key={job.id} className="space-y-2 border-t border-editorial-border pt-3">
        <h3 className="font-display text-lg italic text-editorial-ink">{providers.find((p) => p.key === execution.providerKey)?.label ?? execution.providerKey}</h3>
        <p className="text-xs text-editorial-muted">{t(`jobs.status.${job.status}`)} · {t('federation.pageCount', { page: execution.page, count: execution.received })}</p>
        <p className="text-xs text-editorial-muted">{t('federation.generation', { count: execution.generation })}</p>
        {terminal && <p className="text-xs text-editorial-muted">{t(execution.hasMore ? 'federation.moreAvailable' : job.status === 'completed' ? 'federation.exhausted' : 'federation.partial')}</p>}
        {job.error && <p className="break-words text-xs text-editorial-danger" role="alert">{t(SEARCH_ERRORS[job.error] ?? job.error)}</p>}
        {job.waitingReason && <p className="text-xs text-editorial-muted">{t('federation.waiting')}</p>}
        <div className="flex flex-wrap gap-1">
          {(job.status === 'running' || job.status === 'queued') && <IconButton title={t('jobs.pause')} disabled={busy} onClick={() => act(() => pauseJob(job.id))}><Pause size={14} /></IconButton>}
          {job.status === 'paused' && <IconButton title={t('jobs.resume')} disabled={busy} onClick={() => act(() => resumeJob(job.id))}><Play size={14} /></IconButton>}
          {!terminal && <IconButton title={t('jobs.cancel')} disabled={busy || job.status === 'cancelling'} onClick={() => act(() => cancelJob(job.id))}><Square size={14} /></IconButton>}
          {job.status === 'error' && <IconButton title={t('federation.retry')} disabled={busy} onClick={() => act(() => relaunchSearch(run.id, job.id, 'retry'))}><RotateCcw size={14} /></IconButton>}
          {terminal && <IconButton title={t('federation.restart')} disabled={busy} onClick={() => act(() => relaunchSearch(run.id, job.id, 'restart'))}><RefreshCw size={14} /></IconButton>}
          {job.status === 'completed' && execution.hasMore && <IconButton title={t('dashboard.discovery.loadMore')} disabled={busy} onClick={() => act(() => relaunchSearch(run.id, job.id, 'continue'))}><ArrowDown size={14} /></IconButton>}
        </div>
        <details className="text-xs text-editorial-muted">
          <summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-editorial-accent">{t('federation.executionHistory')}</summary>
          {run.executions.filter((e) => e.providerKey === execution.providerKey).map((e) => <div key={e.job.id} className="py-1">
            {t('federation.generation', { count: e.generation })} · {t(`jobs.status.${e.job.status}`)}
            {e.job.createdAt ? ` · ${formatDateTime(e.job.createdAt)}` : ''}
            <IconButton title={t('federation.viewExecution')} onClick={() => onViewExecution(e.job.id)} size="xs"><Eye size={14} /></IconButton>
          </div>)}
        </details>
      </section>;
    })}
  </div>;
}
