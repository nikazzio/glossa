import { ListChecks, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, EmptyState } from '../ui';
import { formatEta, isTerminal, isWaitingToRetry, type Job } from '../../services/jobsService';
import { isFinishedRecently, isRunning, useJobsStore } from '../../stores/jobsStore';

/**
 * La scheda Lavori del pannello in basso (D20).
 *
 * Tre sezioni — in corso, in attesa, terminati oggi — e per ciascun lavoro solo
 * i comandi ammessi dal suo stato, come icone neutre con spiegazione al
 * passaggio del mouse.
 *
 * Sta dentro il pannello scuro insieme ai messaggi, quindi usa **solo** i token
 * `terminal-*`: infiltrare l'accento dell'interfaccia chiara romperebbe il
 * principio del terminale come versione scura degli stessi toni.
 */
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
      className="terminal-scrollbar h-full overflow-y-auto bg-terminal-bg px-3 py-2"
    >
      {isEmpty ? (
        <EmptyState
          icon={<ListChecks size={20} />}
          message={t('jobs.emptyTitle')}
          hint={t('jobs.emptyDescription')}
        />
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
      <h3 className="mb-1 text-[11px] uppercase tracking-wide text-terminal-secondary">{title}</h3>
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
  const pause = useJobsStore((state) => state.pause);
  const resume = useJobsStore((state) => state.resume);
  const cancel = useJobsStore((state) => state.cancel);
  const retry = useJobsStore((state) => state.retry);

  const waitingToRetry = isWaitingToRetry(job);
  const eta = formatEta(job.etaSeconds);
  const description = job.message ?? t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType });

  return (
    <div className="rounded border border-terminal-line bg-terminal-chrome/60 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-terminal-ink">{description}</span>
        <span className="shrink-0 text-[11px] text-terminal-muted">
          <JobStateLabel job={job} eta={eta} />
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {job.status === 'running' && (
            <IconButton size="xs" tone="default" onClick={() => pause(job.id)} title={t('jobs.pause')} tooltipSide="top">
              <Pause size={11} />
            </IconButton>
          )}
          {(job.status === 'paused' || waitingToRetry) && (
            <IconButton size="xs" tone="default" onClick={() => resume(job.id)} title={t('jobs.resume')} tooltipSide="top">
              <Play size={11} />
            </IconButton>
          )}
          {job.status === 'error' && (
            <IconButton size="xs" tone="default" onClick={() => retry(job.id)} title={t('jobs.retry')} tooltipSide="top">
              <RotateCcw size={11} />
            </IconButton>
          )}
          {!isTerminal(job) && (
            <IconButton size="xs" tone="danger" onClick={() => cancel(job.id)} title={t('jobs.cancel')} tooltipSide="top">
              <X size={11} />
            </IconButton>
          )}
        </div>
      </div>
      <JobProgress job={job} />
    </div>
  );
}

function JobStateLabel({ job, eta }: { job: Job; eta: string | null }) {
  const { t } = useTranslation();

  // Fermo in attesa di riprovare e fermo perché fallito sono la stessa
  // immobilità con significati opposti (D17): vanno dette diversamente.
  if (isWaitingToRetry(job)) {
    return <span className="text-terminal-warn">{eta ? t('jobs.waitingResumesIn', { eta }) : t('jobs.waiting')}</span>;
  }
  if (job.status === 'error') {
    return <span className="text-terminal-error">{job.error ?? t('jobs.failed')}</span>;
  }
  if (job.status === 'completed') return <span className="text-terminal-success">{t('jobs.done')}</span>;
  if (job.status === 'cancelled') return <span>{t('jobs.cancelled')}</span>;
  if (job.status === 'pausing') return <span>{t('jobs.pausing')}</span>;
  if (job.status === 'cancelling') return <span>{t('jobs.cancelling')}</span>;
  if (job.status === 'paused') return <span>{t('jobs.paused')}</span>;
  if (job.status === 'queued') return <span>{t('jobs.queued')}</span>;
  return <span>{eta ? t('jobs.etaShort', { eta }) : t('jobs.running')}</span>;
}

/**
 * La barra si muove con continuità fra un valore e il successivo (D17), ma
 * **mai** quando il lavoro è fermo: lì resta immobile, perché interpolare un
 * avanzamento che non esiste significa far aspettare fidandosi di un numero
 * falso. La transizione rispetta anche la preferenza di sistema per il
 * movimento ridotto.
 */
function JobProgress({ job }: { job: Job }) {
  if (isTerminal(job) || job.progress <= 0) return null;

  const stalled = isWaitingToRetry(job) || job.status === 'paused';

  return (
    <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-terminal-line">
      <div
        role="progressbar"
        aria-valuenow={Math.round(job.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`h-full ${stalled ? 'bg-terminal-warn' : 'bg-terminal-accent motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear'}`}
        style={{ width: `${Math.min(100, Math.round(job.progress * 100))}%` }}
      />
    </div>
  );
}
