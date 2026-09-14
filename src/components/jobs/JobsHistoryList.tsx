import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Ban, CheckCircle2, Layers, RotateCw, Search, Trash2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  clearMatchingJobs,
  isTerminal,
  listJobs,
  type Job,
  type JobStatus,
} from '../../services/jobsService';
import { errorMessage, logger } from '../../utils/logger';
import { confirm } from '../../stores/confirmStore';
import { useJobsStore } from '../../stores/jobsStore';
import { EmptyState, IconButton, ListReveal, Spinner } from '../ui';
import { FIELD_INLINE_CLASSNAME } from '../ui/fieldStyles';
import { JobRow, JobTypeIcon } from './JobRow';

/** Quanti lavori per pagina. L'elenco non si svuota da solo: si legge a tratti. */
const PAGE_SIZE = 50;

/** Quanto si aspetta prima di cercare, mentre si scrive. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Gli esiti, non gli otto stati del deposito: «in corso», «riuscito»,
 * «fallito», «interrotto». Chi cerca un lavoro di ieri ragiona per com'è
 * andato, non per la parola con cui la coda lo ha segnato.
 */
const OUTCOMES: { key: string; statuses: JobStatus[]; icon: typeof Activity }[] = [
  { key: 'active', statuses: ['queued', 'running', 'pausing', 'paused', 'cancelling'], icon: Activity },
  { key: 'completed', statuses: ['completed'], icon: CheckCircle2 },
  { key: 'error', statuses: ['error'], icon: XCircle },
  { key: 'cancelled', statuses: ['cancelled'], icon: Ban },
];

const JOB_TYPES = ['source_download', 'provider_search', 'vault_verification', 'image_optimization'];

/**
 * Tutti i lavori con il loro esito, nella colonna di destra della Panoramica.
 *
 * Qui i lavori restano sempre: svuotare il pannello in basso nasconde le righe
 * da lì, non le cancella. Si eliminano davvero solo da questo elenco, una per
 * una o in blocco su quello che i filtri stanno mostrando.
 */
export function JobsHistoryList() {
  const { t } = useTranslation();
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Un lavoro che nasce o che finisce cambia questo elenco: si rilegge quando
  // la coda cambia davvero, non a intervalli.
  const queueSignal = useJobsStore(
    (state) => `${state.jobs.length}:${state.jobs.filter(isTerminal).length}`,
  );
  // Eliminare qui toglie la riga anche dal pannello in basso: è lo stesso
  // lavoro, e lasciarcelo fino al riavvio sarebbe una riga che non esiste più.
  const clearFinished = useJobsStore((state) => state.clearFinished);
  const reloadQueue = useJobsStore((state) => state.load);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const statuses = useMemo(
    () => OUTCOMES.filter((outcome) => outcomes.includes(outcome.key)).flatMap((outcome) => outcome.statuses),
    [outcomes],
  );

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const page = await listJobs({ statuses, jobTypes, query, limit: PAGE_SIZE, offset });
        setJobs((previous) => (offset === 0 ? page.jobs : [...previous, ...page.jobs]));
        setTotal(page.total);
        setFailed(false);
      } catch (error) {
        logger.error('jobsHistory.loadFailed', { reason: errorMessage(error) });
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [statuses, jobTypes, query],
  );

  useEffect(() => {
    void load(0);
  }, [load, queueSignal]);

  const toggle = (values: string[], value: string) =>
    values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

  async function removeOne(job: Job): Promise<void> {
    const ok = await confirm({
      title: t('jobsHistory.deleteConfirmTitle'),
      message: t('jobsHistory.deleteConfirmMessage'),
      confirmLabel: t('jobsHistory.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      // Zero righe tolte vuol dire che il database l'ha tenuta: oggi succede
      // ai lavori di una ricerca, che se ne vanno insieme alla ricerca.
      const removed = await clearFinished(job.id);
      if (removed === 0) toast.info(t('jobsHistory.deleteBlocked'));
      await load(0);
    } catch (error) {
      logger.error('jobsHistory.deleteFailed', { reason: errorMessage(error) });
      setFailed(true);
    }
  }

  async function removeShown(): Promise<void> {
    const ok = await confirm({
      title: t('jobsHistory.clearShownConfirmTitle'),
      message: t('jobsHistory.clearShownConfirmMessage'),
      confirmLabel: t('jobsHistory.clearShown'),
      danger: true,
    });
    if (!ok) return;
    try {
      const removed = await clearMatchingJobs({ statuses, jobTypes, query });
      toast.info(removed === 0 ? t('jobsHistory.deleteBlocked') : t('jobsHistory.cleared', { count: removed }));
      await reloadQueue();
      await load(0);
    } catch (error) {
      logger.error('jobsHistory.clearFailed', { reason: errorMessage(error) });
      setFailed(true);
    }
  }

  const hasFilters = outcomes.length > 0 || jobTypes.length > 0 || query !== '';
  const deletable = jobs.some(isTerminal);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-editorial-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex min-w-0 flex-1 items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-editorial-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('jobsHistory.searchPlaceholder')}
              aria-label={t('jobsHistory.searchPlaceholder')}
              className={`${FIELD_INLINE_CLASSNAME} w-full pl-8`}
            />
          </span>
          <IconButton size="sm" title={t('jobsHistory.reload')} onClick={() => void load(0)}>
            <RotateCw size={13} />
          </IconButton>
          {/* Elimina quello che i filtri mostrano, non «tutto»: con un filtro
              attivo il comando fa una cosa più piccola, e lo dice. */}
          <IconButton
            size="sm"
            tone="danger"
            title={hasFilters ? t('jobsHistory.clearShown') : t('jobsHistory.clearAll')}
            disabled={!deletable}
            onClick={() => void removeShown()}
          >
            <Trash2 size={13} />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {OUTCOMES.map(({ key, icon: Icon }) => (
            <IconButton
              key={key}
              size="sm"
              tone={outcomes.includes(key) ? 'accent' : 'default'}
              ariaPressed={outcomes.includes(key)}
              title={t(`jobsHistory.outcome.${key}`)}
              onClick={() => setOutcomes((current) => toggle(current, key))}
            >
              <Icon size={13} />
            </IconButton>
          ))}
          <span className="mx-1 h-4 w-px bg-editorial-border" aria-hidden="true" />
          {JOB_TYPES.map((jobType) => (
            <IconButton
              key={jobType}
              size="sm"
              tone={jobTypes.includes(jobType) ? 'accent' : 'default'}
              ariaPressed={jobTypes.includes(jobType)}
              title={t(`jobs.type.${jobType}`, { defaultValue: jobType })}
              onClick={() => setJobTypes((current) => toggle(current, jobType))}
            >
              <JobTypeIcon jobType={jobType} />
            </IconButton>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-editorial-muted">
          <span>{t('jobsHistory.count', { shown: jobs.length, total })}</span>
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setOutcomes([]); setJobTypes([]); setSearch(''); }}
              className="text-xs text-editorial-muted underline-offset-2 transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {t('jobsHistory.clearFilters')}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
        {failed && (
          <p role="alert" className="py-4 text-xs text-editorial-danger">{t('jobsHistory.failed')}</p>
        )}

        <ul className="flex flex-col gap-1">
          {jobs.map((job, index) => (
            <li key={job.id}>
              <ListReveal index={index}>
                <JobRow job={job} onRemove={() => void removeOne(job)} removeLabel={t('jobsHistory.delete')} singleColumn />
              </ListReveal>
            </li>
          ))}
        </ul>

        {loading && (
          <Spinner
            size={12}
            label={t('jobsHistory.loading')}
            className="flex items-center gap-2 py-4 text-xs text-editorial-muted"
          />
        )}

        {!loading && jobs.length === 0 && !failed && (
          <EmptyState
            icon={<Layers size={18} />}
            message={t('jobsHistory.empty')}
            className="flex flex-col items-center gap-2 px-3 py-10 text-center"
          />
        )}

        {jobs.length < total && !loading && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={() => void load(jobs.length)}
              className="text-xs uppercase tracking-[0.14em] text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {t('jobsHistory.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
