import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Ban, CheckCircle2, ChevronDown, FilterX, Layers, RotateCw, Trash2, XCircle } from 'lucide-react';
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
import { CatalogSearchField, EmptyState, IconButton, ListReveal, Spinner } from '../ui';
import { localDay } from '../../utils/dashboardActivity';
import { parseStoredDate } from '../../utils/dashboardStats';
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

const JOB_TYPES = ['source_download', 'source_pdf_download', 'image_optimization', 'ocr_page', 'provider_search', 'vault_verification'];

/**
 * Tutti i lavori con il loro esito, nella colonna di destra della Panoramica.
 *
 * Qui i lavori restano sempre: svuotare il pannello in basso nasconde le righe
 * da lì, non le cancella. Si eliminano davvero solo da questo elenco, una per
 * una o in blocco su quello che i filtri stanno mostrando.
 */
export function JobsHistoryList() {
  const { t, i18n } = useTranslation();
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Un lavoro che nasce o che finisce cambia *quali* righe stanno in pagina:
  // solo allora si rilegge il deposito. Gli aggiornamenti continui — percentuale
  // che sale, messaggio che cambia — non fanno una nuova interrogazione: la
  // riga in pagina prende la versione viva, che è la stessa cosa senza il costo.
  const liveJobs = useJobsStore((state) => state.jobs);
  const queueSignal = `${liveJobs.length}:${liveJobs.filter(isTerminal).length}`;
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
  // La riga mostra sempre lo stato più recente: quella letta dal deposito è di
  // quando è arrivata la pagina, e un lavoro che nel frattempo è avanzato
  // resterebbe fermo a schermo.
  const rows = jobs.map((job) => liveJobs.find((live) => live.id === job.id) ?? job);
  const today = localDay(new Date());
  const yesterday = localDay(new Date(Date.now() - 86_400_000));
  const dayLabel = (day: string) => day === today ? t('jobsHistory.today')
    : day === yesterday ? t('jobsHistory.yesterday')
      : day === '' ? t('jobsHistory.undated')
        : new Date(`${day}T12:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long' });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-editorial-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CatalogSearchField value={search} onChange={setSearch}
              placeholder={t('jobsHistory.searchPlaceholder')} label={t('jobsHistory.searchPlaceholder')} />
          </div>
          <IconButton size="sm" title={t('jobsHistory.reload')} onClick={() => void load(0)}>
            <RotateCw size={14} />
          </IconButton>
          {/* Elimina quello che i filtri mostrano, non «tutto»: con un filtro
              attivo il comando fa una cosa più piccola, e lo dice. */}
          <IconButton
            size="sm"
            tone="danger"
            title={hasFilters ? t('jobsHistory.clearShown') : t('jobsHistory.clearAll')}
            // Non si guarda cosa c'è in questa pagina: la cancellazione lavora
            // su tutto l'insieme filtrato, e con cinquanta lavori attivi in
            // testa il comando risultava spento mentre c'era da eliminare.
            disabled={total === 0}
            onClick={() => void removeShown()}
          >
            <Trash2 size={14} />
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
              <Icon size={14} />
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
            <IconButton size="sm" title={t('jobsHistory.clearFilters')}
              onClick={() => { setOutcomes([]); setJobTypes([]); setSearch(''); }}>
              <FilterX size={14} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
        {failed && (
          <p role="alert" className="py-4 text-xs text-editorial-danger">{t('jobsHistory.failed')}</p>
        )}

        {groupByDay(rows).map((group) => (
          <section key={group.day} aria-label={dayLabel(group.day)}>
            <h3 className="sticky top-0 z-[1] bg-surface-panel pb-1 pt-2 caption-label">{dayLabel(group.day)}</h3>
            <ul className="flex flex-col">
              {group.jobs.map((job, index) => (
                <li key={job.id}>
                  <ListReveal index={index}>
                    <JobRow job={job} onRemove={() => void removeOne(job)} removeLabel={t('jobsHistory.delete')} singleColumn />
                  </ListReveal>
                </li>
              ))}
            </ul>
          </section>
        ))}

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
            <IconButton title={t('jobsHistory.loadMore')} onClick={() => void load(jobs.length)}>
              <ChevronDown size={16} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** I lavori nell'ordine in cui arrivano, divisi per giorno di creazione. */
function groupByDay(jobs: Job[]): { day: string; jobs: Job[] }[] {
  return jobs.reduce<{ day: string; jobs: Job[] }[]>((groups, job) => {
    const day = job.createdAt ? localDay(parseStoredDate(job.createdAt)) : '';
    const last = groups.at(-1);
    return last && last.day === day
      ? [...groups.slice(0, -1), { day, jobs: [...last.jobs, job] }]
      : [...groups, { day, jobs: [job] }];
  }, []);
}
