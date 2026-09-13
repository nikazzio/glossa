import { ArrowDown, BookOpen, ChevronDown, Eye, Info, Loader, Pause, Play, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentExecutions, type SearchRun, relaunchSearch } from '../../services/federatedSearchService';
import { cancelJob, isTerminal, pauseJob, resumeJob } from '../../services/jobsService';
import type { IIIFProvider } from '../../types';
import { useState } from 'react';
import { formatDateTime } from '../../utils';
import { IconButton, SectionLabel, StatBlock, StatRow } from '../ui';
import { SEARCH_ERRORS } from '../dashboard/SourceDiscoveryPanel';

export function SearchExecutionPanel({ run, providers, busy, act, onViewExecution }: {
  run: SearchRun; providers: IIIFProvider[]; busy: boolean;
  act: (work: () => Promise<unknown>) => void;
  onViewExecution: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
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
        <SectionLabel icon={job.status === 'running' ? Loader : BookOpen}
          label={providers.find((p) => p.key === execution.providerKey)?.label ?? execution.providerKey} />
        {/* Colonna stretta: i dati stanno su righe proprie, non concatenati. */}
        <dl className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
          {/* L'oro è il colore delle attività in corso: una fonte che sta
              lavorando si distingue senza leggere. */}
          <StatRow label={t('federation.stateLabel')} value={
            job.status === 'running'
              ? <span className="text-editorial-running">{t(`jobs.status.${job.status}`)}</span>
              : job.status === 'error'
                ? <span className="text-editorial-danger">{t(`jobs.status.${job.status}`)}</span>
                : t(`jobs.status.${job.status}`)
          } />
          <StatRow label={t('federation.pageLabel')} value={String(execution.page)} />
          <StatRow label={t('federation.receivedLabel')} value={String(execution.received)} />
          <StatRow label={t('federation.generationLabel')} value={String(execution.generation)} />
          {terminal && <StatRow label={t('federation.coverageLabel')}
            value={t(execution.hasMore ? 'federation.moreAvailable' : job.status === 'completed' ? 'federation.exhausted' : 'federation.partial')} />}
        </dl>
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
        <div className="flex items-center gap-2 text-xs text-editorial-muted">
          <span>{t('federation.executionHistory')}</span>
          <IconButton title={t('federation.executionHistory')} size="xs" aria-expanded={open === job.id}
            aria-controls={`execution-history-${job.id}`} onClick={() => setOpen(open === job.id ? null : job.id)}>
            <ChevronDown size={14} className={open === job.id ? '' : '-rotate-90'} />
          </IconButton>
        </div>
        <div id={`execution-history-${job.id}`} hidden={open !== job.id} className="text-xs text-editorial-muted">
          {run.executions.filter((e) => e.providerKey === execution.providerKey).map((e) => <div key={e.job.id} className="py-1">
            {t('federation.generation', { count: e.generation })} · {t(`jobs.status.${e.job.status}`)}
            {e.job.createdAt ? ` · ${formatDateTime(e.job.createdAt)}` : ''}
            <IconButton title={t('federation.viewExecution')} onClick={() => onViewExecution(e.job.id)} size="xs"><Eye size={14} /></IconButton>
          </div>)}
        </div>
      </section>;
    })}
  </div>;
}
