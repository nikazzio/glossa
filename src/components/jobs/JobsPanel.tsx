import { ChevronRight, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';
import { useUiStore } from '../../stores/uiStore';
import { dashboardLocation } from '../../navigation/appLocation';
import {
  formatEta,
  isTerminal,
  isWaitingForLibrary,
  isWaitingToRetry,
  retryCountdownSeconds,
  type Job,
} from '../../services/jobsService';
import { isFinishedRecently, isRunning, useJobsStore } from '../../stores/jobsStore';
import { parseJobDetail, type JobDetail } from '../../services/jobsService';
import { humanSize } from '../../utils';

/** Lavori in corso, in attesa e terminati oggi. */
export function JobsPanel({ panelId, labelledBy }: { panelId: string; labelledBy: string }) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const now = Date.now();

  const running = jobs.filter(isRunning);
  const waiting = jobs.filter((job) => !isTerminal(job) && !isRunning(job));
  const finished = jobs.filter((job) => isFinishedRecently(job, now));

  const isEmpty = running.length === 0 && waiting.length === 0 && finished.length === 0;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="custom-scrollbar h-full overflow-y-auto bg-editorial-bg px-3 py-2"
    >
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
          <p className="text-sm text-editorial-muted">{t('jobs.emptyTitle')}</p>
          <p className="text-xs text-editorial-muted">{t('jobs.emptyDescription')}</p>
        </div>
      ) : (
        <>
          <JobsSection title={t('jobs.sectionRunning')} jobs={running} />
          <JobsSection title={t('jobs.sectionWaiting')} jobs={waiting} />
          <JobsSection title={t('jobs.sectionFinished')} jobs={finished} />
        </>
      )}
    </div>
  );
}

function JobsSection({ title, jobs }: { title: string; jobs: Job[] }) {
  if (jobs.length === 0) return null;

  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1 text-[11px] uppercase tracking-wide text-editorial-muted">{title}</h3>
      <ul className="flex flex-col gap-1">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobRow job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobRow({ job }: { job: Job }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pause = useJobsStore((state) => state.pause);
  const resume = useJobsStore((state) => state.resume);
  const cancel = useJobsStore((state) => state.cancel);
  const retry = useJobsStore((state) => state.retry);
  const clearFinished = useJobsStore((state) => state.clearFinished);

  const navigate = useUiStore((state) => state.navigate);
  let searchId: string | undefined;
  if (job.jobType === 'provider_search') {
    try { const config: unknown = JSON.parse(job.config); if (config && typeof config === 'object' && 'searchId' in config && typeof config.searchId === 'string') searchId = config.searchId; } catch { /* Invalid config remains inspectable in job details. */ }
  }
  const waitingToRetry = isWaitingToRetry(job);
  const eta = formatEta(job.etaSeconds);
  const detail = parseJobDetail(job.detail);
  const description = job.message ?? jobTypeLabel(job, t);

  return (
    <div className="rounded border border-editorial-border bg-surface-panel">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <IconButton title={t('federation.details')} aria-expanded={open} onClick={() => setOpen((current) => !current)} size="xs">
          <ChevronRight
            size={11}
            className={`shrink-0 text-editorial-muted motion-safe:transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded-sm border border-editorial-border px-1 py-px text-[10px] uppercase tracking-wide text-editorial-muted">
            {t(`jobs.short.${job.jobType}`, { defaultValue: job.jobType })}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-editorial-ink">{description}</span>
          {detail.units && (
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-editorial-muted">
              {detail.units.done}/{detail.units.total}
              {detail.unavailable !== undefined && detail.unavailable > 0 && (
                <span className="text-editorial-muted">
                  {' '}
                  · {t('jobs.detail.unavailableShort', { count: detail.unavailable })}
                </span>
              )}
            </span>
          )}
          {detail.bytes && (
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-editorial-muted">
              {humanSize(detail.bytes.downloaded)}
              {detail.bytes.estimated > 0 && ` / ~${humanSize(detail.bytes.estimated)}`}
{detail.speed !== undefined && detail.speed > 0 && ` · ${humanSize(detail.speed)}/s`}
            </span>
          )}
        </div>

        <span className="shrink-0 whitespace-nowrap text-xs text-editorial-muted">
          <JobStateLabel job={job} eta={eta} />
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {searchId && <IconButton title={t('federation.open')} onClick={() => navigate(dashboardLocation({view:'search',searchId}))}><ChevronRight size={14} /></IconButton>}
          {job.status === 'running' && (
            <IconButton title={t('jobs.pause')} onClick={() => void pause(job.id)}>
              <Pause size={11} />
            </IconButton>
          )}
          {job.status === 'paused' && (
            <IconButton title={t('jobs.resume')} onClick={() => void resume(job.id)}>
              <Play size={11} />
            </IconButton>
          )}
          {waitingToRetry && (
            <IconButton title={t('jobs.retryNow')} onClick={() => void resume(job.id)}>
              <Play size={11} />
            </IconButton>
          )}
          {waitingToRetry && (
            <IconButton title={t('jobs.pause')} onClick={() => void pause(job.id)}>
              <Pause size={11} />
            </IconButton>
          )}
          {job.status === 'error' && job.jobType !== 'provider_search' && (
            <IconButton title={t('jobs.retry')} onClick={() => void retry(job.id)}>
              <RotateCcw size={11} />
            </IconButton>
          )}
          {!isTerminal(job) && (
            <IconButton title={t('jobs.cancel')} tone="danger" onClick={() => void cancel(job.id)}>
              <X size={11} />
            </IconButton>
          )}
          {isTerminal(job) && job.jobType !== 'provider_search' && (
            <IconButton title={t('jobs.dismiss')} onClick={() => void clearFinished(job.id)}>
              <Trash2 size={11} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="px-2.5 pb-2">
        <JobProgress job={job} />
      </div>

      <div
        className={`grid px-2.5 motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${
          open ? 'grid-rows-[1fr] pb-2' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">{open && <JobDetails job={job} detail={detail} />}</div>
      </div>
    </div>
  );
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = wide && value.length > FOLD_AFTER;

  return (
    <div className={`flex min-w-0 items-baseline gap-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="w-28 shrink-0 text-[11px] uppercase leading-5 tracking-wide text-editorial-muted">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 font-mono text-xs leading-5 text-editorial-ink ${
          wide && (open || !long) ? 'whitespace-normal break-words' : 'truncate'
        }`}
      >
        {value}
      </span>
      {long && (
        <IconButton title={open ? t('jobs.detail.foldLess') : t('jobs.detail.foldMore')}
          onClick={() => setOpen((current) => !current)}
          size="xs"
        >
          <ChevronRight size={14} className={open ? 'rotate-90' : ''} />
        </IconButton>
      )}
    </div>
  );
}

function jobTypeLabel(job: Job, t: (key: string, options?: Record<string, unknown>) => string): string {
  const base = t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType });
  if (job.jobType !== 'vault_verification') return base;
  try {
    const full = (JSON.parse(job.config ?? '{}') as { full?: boolean }).full === true;
    return `${base} · ${t(full ? 'jobs.detail.levelValue.full' : 'jobs.detail.levelValue.quick')}`;
  } catch {
    return base;
  }
}

/** Oltre questa lunghezza un valore sta su una riga sola finché non lo si apre. */
const FOLD_AFTER = 60;

function JobDetails({ job, detail }: { job: Job; detail: JobDetail }) {
  const { t } = useTranslation();
  // Sempre su 24 ore: un registro tecnico non si legge con AM e PM.
  const time = (value: string | null) =>
    value
      ? new Date(value.replace(' ', 'T') + 'Z').toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      : '—';

  const work: DetailField[] = [
    { label: t('jobs.detail.type'), value: t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType }) },
    {
      label: t('jobs.detail.phase'),
      value: job.phase ? t(`jobs.phase.${job.phase}`, { defaultValue: job.phase }) : '—',
    },
    detail.units && {
      label: t(`jobs.detail.units.${detail.units.label}`, { defaultValue: t('jobs.detail.units.generic') }),
      value: `${detail.units.done} / ${detail.units.total}`,
    },
    detail.bytes && {
      label: t('jobs.detail.bytes'),
      value:
        detail.bytes.estimated > 0
          ? `${humanSize(detail.bytes.downloaded)} / ~${humanSize(detail.bytes.estimated)}`
          : humanSize(detail.bytes.downloaded),
    },
    detail.speed !== undefined &&
      detail.speed > 0 && {
        label: t('jobs.detail.speed'),
        value: `${humanSize(detail.speed)}/s`,
      },
    detail.unavailable !== undefined &&
      detail.unavailable > 0 && {
        label: t('jobs.detail.unavailable'),
        value: String(detail.unavailable),
      },
    detail.cap && { label: t('jobs.detail.cap'), value: readableSize(detail.cap, t) },
    detail.shrunk !== undefined && {
      label: t('jobs.detail.shrunk'),
      value: String(detail.shrunk),
    },
    detail.skipped !== undefined &&
      detail.skipped > 0 && {
        label: t('jobs.detail.skipped'),
        value: String(detail.skipped),
      },
    detail.freed !== undefined && { label: t('jobs.detail.freed'), value: humanSize(detail.freed) },
    detail.provider && { label: t('jobs.detail.provider'), value: detail.provider },
    detail.host && { label: t('jobs.detail.host'), value: detail.host },
    detail.level && {
      label: t('jobs.detail.level'),
      value: t(`jobs.detail.levelValue.${detail.level}`, { defaultValue: detail.level }),
    },
    detail.intact !== undefined && { label: t('jobs.detail.intact'), value: String(detail.intact) },
    detail.missing !== undefined && { label: t('jobs.detail.missing'), value: String(detail.missing) },
    detail.corrupt !== undefined && { label: t('jobs.detail.corrupt'), value: String(detail.corrupt) },
    detail.orphans && {
      label: t('jobs.detail.orphans'),
      value: `${detail.orphans.count} · ${humanSize(detail.orphans.bytes)}`,
    },
    { label: t('jobs.detail.attempt'), value: `${job.attemptCount} / ${job.maxAttempts}` },
    { label: t('jobs.detail.started'), value: time(job.createdAt) },
    { label: t('jobs.detail.updated'), value: time(job.updatedAt) },
    job.error && {
      label: t('jobs.detail.error'),
      value: job.error.startsWith('optimization_incomplete:')
        ? t('jobs.error.optimizationIncomplete', {
            count: Number(job.error.split(':')[1]) || detail.skipped || 1,
          })
        : job.error,
      wide: true,
    },
    { label: t('jobs.detail.id'), value: job.id, wide: true },
  ].filter((field): field is DetailField => typeof field === 'object' && field !== null);

  const lastUnit: DetailField[] = detail.last
    ? ([
        { label: t('jobs.detail.lastIndex'), value: String(detail.last.index) },
        detail.last.label && { label: t('jobs.detail.lastLabel'), value: detail.last.label },
        detail.last.size && {
          label: t('jobs.detail.lastSize'),
          value: readableSize(detail.last.size, t),
        },
        detail.last.pixels && { label: t('jobs.detail.lastPixels'), value: detail.last.pixels },
        detail.last.bytes !== undefined && {
          label: t('jobs.detail.lastBytes'),
          value: humanSize(detail.last.bytes),
        },
        detail.last.recovered !== undefined && {
          label: t('jobs.detail.lastOrigin'),
          value: t(
            detail.last.recovered ? 'jobs.detail.lastFromDisk' : 'jobs.detail.lastDownloaded',
          ),
        },
      ].filter((field): field is DetailField => typeof field === 'object' && field !== null))
    : [];

  return (
    <div className="flex flex-col gap-2 border-t border-editorial-border pt-2">
      <FieldGroup title={t('jobs.detail.groupWork')} fields={work} />
      {lastUnit.length > 0 && (
        <FieldGroup title={t('jobs.detail.groupLast')} fields={lastUnit} />
      )}
    </div>
  );
}

function FieldGroup({ title, fields }: { title: string; fields: DetailField[] }) {
  return (
    <section>
      <h4 className="mb-1.5 border-b border-editorial-border pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-editorial-accent">
        {title}
      </h4>
      <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
        {[...fields.filter((field) => !field.wide), ...fields.filter((field) => field.wide)].map(
          (field) => (
            <Field key={field.label} label={field.label} value={field.value} wide={field.wide} />
          ),
        )}
      </div>
    </section>
  );
}

function readableSize(token: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (token === 'max' || token === 'full') return t('jobs.detail.sizeMax');
  const width = token.replace(/[^0-9]/g, '');
  return width ? t('jobs.detail.sizePixels', { value: width }) : token;
}

/** Una riga dei dettagli. `wide` è per i valori che non stanno su una colonna. */
interface DetailField {
  label: string;
  value: string;
  wide?: boolean;
}

function JobStateLabel({ job, eta }: { job: Job; eta: string | null }) {
  const { t } = useTranslation();

  if (isWaitingToRetry(job)) {
    const countdown = formatEta(retryCountdownSeconds(job));
    return (
      <span className="text-editorial-warning">
        {countdown ? t('jobs.retryingIn', { eta: countdown }) : t('jobs.retrying')}
      </span>
    );
  }
  if (isWaitingForLibrary(job)) {
    return <span className="text-editorial-warning">{t('jobs.waitingForLibrary')}</span>;
  }
  if (job.status === 'error') {
    return <span className="text-editorial-danger">{job.error ?? t('jobs.failed')}</span>;
  }
  if (job.status === 'completed') return <span className="text-editorial-success">{t('jobs.done')}</span>;
  if (job.status === 'cancelled') return <span>{t('jobs.cancelled')}</span>;
  if (job.status === 'pausing') return <span>{t('jobs.pausing')}</span>;
  if (job.status === 'cancelling') return <span>{t('jobs.cancelling')}</span>;
  if (job.status === 'paused') return <span>{t('jobs.paused')}</span>;
  if (job.status === 'queued') return <span>{t('jobs.queued')}</span>;

  const phase = job.phase ? t(`jobs.phase.${job.phase}`, { defaultValue: job.phase }) : null;
  const parts = [phase, eta ? t('jobs.etaShort', { eta }) : null].filter(Boolean);
  return <span>{parts.length > 0 ? parts.join(' · ') : t('jobs.running')}</span>;
}

function JobProgress({ job }: { job: Job }) {
  if (isTerminal(job) || job.progress <= 0) return null;

  const stalled = isWaitingToRetry(job) || isWaitingForLibrary(job) || job.status === 'paused';

  return (
    <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-editorial-border">
      <div
        role="progressbar"
        aria-valuenow={Math.round(job.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`h-full min-w-[2px] ${stalled ? 'bg-editorial-warning' : 'bg-editorial-accent motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear'}`}
        style={{ width: `${Math.min(100, Math.round(job.progress * 100))}%` }}
      />
    </div>
  );
}
