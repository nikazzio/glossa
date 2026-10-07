import { CheckCircle2, CircleDashed, Filter, Loader, PauseCircle, RotateCcw, Square, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentExecutions, relaunchSearch, type SearchExecution, type SearchRun } from '../../services/federatedSearchService';
import type { IIIFProvider } from '../../types';
import { IconButton, Tooltip } from '../ui';
import { SEARCH_ERRORS } from './SourceListRow';

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
 * Una riga per fonte: stato, nome, quanti risultati, e i due comandi che
 * servono a chi cerca — riprovare dopo un errore e guardare solo quella fonte.
 * Pause, ripartenze e tentativi precedenti sono affari del lavoro, e stanno nel
 * pannello dei lavori.
 */
export function SearchExecutionPanel({ run, providers, busy, providerFilter, onProviderFilter, act }: {
  run: SearchRun;
  providers: IIIFProvider[];
  busy: boolean;
  providerFilter: string;
  onProviderFilter: (providerKey: string) => void;
  act: (work: () => Promise<unknown>) => void;
}) {
  const { t } = useTranslation();
  const label = (key: string) => providers.find((provider) => provider.key === key)?.label ?? key;

  return (
    <ul className="divide-y divide-rule border-b border-rule px-3">
      {currentExecutions(run).map((execution) => {
        const { job } = execution;
        const only = providerFilter === execution.providerKey;
        return (
          <li key={job.id} className="min-w-0 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <StateMark status={job.status} />
              <span className="min-w-0 flex-1 truncate text-xs text-editorial-ink">{label(execution.providerKey)}</span>
              <span className="shrink-0 tabular-nums text-xs text-editorial-muted">{execution.received}</span>
              {job.status === 'error' && (
                <IconButton size="xs" title={t('federation.retry')} disabled={busy}
                  onClick={() => act(() => relaunchSearch(run.id, job.id, 'retry'))}><RotateCcw size={12} /></IconButton>
              )}
              <IconButton size="xs" ariaPressed={only} tone={only ? 'accent' : 'default'}
                title={only ? t('federation.allSources') : t('federation.onlyThisSource')}
                onClick={() => onProviderFilter(only ? 'all' : execution.providerKey)}><Filter size={12} /></IconButton>
            </div>
            {job.error && (
              <p className="mt-1 break-words pl-6 text-xs text-editorial-danger" role="alert">
                {t(SEARCH_ERRORS[job.error] ?? job.error)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
