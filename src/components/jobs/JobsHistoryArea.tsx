import { useCallback, useEffect, useState } from 'react';
import { Layers, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  clearFinishedJobs,
  isTerminal,
  listJobs,
  type Job,
  type JobStatus,
} from '../../services/jobsService';
import { errorMessage, logger } from '../../utils/logger';
import { confirm } from '../../stores/confirmStore';
import { formatDateTime } from '../../utils';
import { EmptyState, FieldLabel, IconButton, Select, Spinner } from '../ui';
import { JobTypeIcon, jobTypeLabel } from './JobsPanel';

/** Quanti job per pagina. Lo storico non si svuota da solo: si legge a tratti. */
const PAGE_SIZE = 50;

const STATUSES: JobStatus[] = [
  'queued', 'running', 'pausing', 'paused', 'cancelling', 'cancelled', 'completed', 'error',
];
const JOB_TYPES = ['provider_search', 'source_download', 'vault_verification', 'image_optimization'];

/**
 * Lo storico completo dei job: tutto quello che è passato dalla coda, non solo
 * ciò che sta girando adesso. Il panel resta la vista operativa; qui si cerca
 * un job di mesi fa, si legge com'è finito e lo si elimina.
 */
export function JobsHistoryArea() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'all' | JobStatus>('all');
  const [jobType, setJobType] = useState<'all' | string>('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const page = await listJobs({
          statuses: status === 'all' ? undefined : [status],
          jobTypes: jobType === 'all' ? undefined : [jobType],
          limit: PAGE_SIZE,
          offset,
        });
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
    [status, jobType],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function removeOne(job: Job): Promise<void> {
    const ok = await confirm({
      title: t('jobsHistory.deleteConfirmTitle'),
      message: t('jobsHistory.deleteConfirmMessage'),
      confirmLabel: t('jobsHistory.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await clearFinishedJobs(job.id);
      await load(0);
    } catch (error) {
      logger.error('jobsHistory.deleteFailed', { reason: errorMessage(error) });
      setFailed(true);
    }
  }

  async function removeFinished(): Promise<void> {
    const ok = await confirm({
      title: t('jobsHistory.clearConfirmTitle'),
      message: t('jobsHistory.clearConfirmMessage'),
      confirmLabel: t('jobsHistory.clearFinished'),
      danger: true,
    });
    if (!ok) return;
    try {
      await clearFinishedJobs();
      await load(0);
    } catch (error) {
      logger.error('jobsHistory.clearFailed', { reason: errorMessage(error) });
      setFailed(true);
    }
  }

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="jobs-history-status">{t('jobsHistory.statusFilter')}</FieldLabel>
          <Select
            id="jobs-history-status"
            value={status}
            onChange={(value) => setStatus(value as 'all' | JobStatus)}
            options={[
              { value: 'all', label: t('jobsHistory.allStatuses') },
              ...STATUSES.map((entry) => ({ value: entry, label: t(`jobs.status.${entry}`, { defaultValue: entry }) })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="jobs-history-type">{t('jobsHistory.typeFilter')}</FieldLabel>
          <Select
            id="jobs-history-type"
            value={jobType}
            onChange={setJobType}
            options={[
              { value: 'all', label: t('jobsHistory.allTypes') },
              ...JOB_TYPES.map((entry) => ({ value: entry, label: t(`jobs.type.${entry}`, { defaultValue: entry }) })),
            ]}
          />
        </div>
        <p className="flex-1 text-xs text-editorial-muted">{t('jobsHistory.count', { shown: jobs.length, total })}</p>
        <IconButton size="sm" title={t('jobsHistory.clearFinished')} onClick={() => void removeFinished()}>
          <Trash2 size={14} />
        </IconButton>
      </div>

      {failed && (
        <p role="alert" className="py-4 text-xs text-editorial-danger">{t('jobsHistory.failed')}</p>
      )}

      <div className="space-y-1.5">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center gap-2 rounded border border-editorial-border bg-surface-panel px-2.5 py-2">
            <span className="shrink-0 text-editorial-muted" role="img" aria-label={t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType })}>
              <JobTypeIcon jobType={job.jobType} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-editorial-ink">
              {job.message ?? jobTypeLabel(job, t)}
            </span>
            <span className="shrink-0 text-xs text-editorial-muted">
              {t(`jobs.status.${job.status}`, { defaultValue: job.status })}
            </span>
            <span className="shrink-0 font-mono text-xs text-editorial-muted">
              {job.updatedAt ?? job.createdAt ? formatDateTime(job.updatedAt ?? job.createdAt ?? '') : '—'}
            </span>
            {/* Un job ancora in corso non si elimina: prima si annulla. */}
            {isTerminal(job) && (
              <IconButton size="xs" title={t('jobsHistory.delete')} onClick={() => void removeOne(job)}>
                <Trash2 size={12} />
              </IconButton>
            )}
          </div>
        ))}
      </div>

      {loading && <Spinner size={12} label={t('jobsHistory.loading')} className="flex items-center gap-2 py-4 text-xs text-editorial-muted" />}

      {!loading && jobs.length === 0 && (
        <EmptyState icon={<Layers size={18} />} message={t('jobsHistory.empty')} className="flex flex-col items-center gap-2 px-3 py-10 text-center" />
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
  );
}
