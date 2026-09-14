import { useTranslation } from 'react-i18next';
import { isTerminal, type Job } from '../../services/jobsService';
import { isFinishedRecently, isRunning, useJobsStore } from '../../stores/jobsStore';
import { JobRow } from './JobRow';

/**
 * Lavori in corso, in attesa e conclusi di recente.
 *
 * È la vista di adesso: si guarda cosa sta girando e si interviene. Svuotare il
 * pannello toglie le righe concluse da qui e non dal deposito — l'elenco
 * completo, con gli esiti di sempre, sta nella Panoramica, ed è lì che si
 * elimina davvero.
 */
export function JobsPanel({ panelId, labelledBy }: { panelId: string; labelledBy: string }) {
  const { t } = useTranslation();
  const allJobs = useJobsStore((state) => state.jobs);
  const dismissed = useJobsStore((state) => state.dismissed);
  const dismiss = useJobsStore((state) => state.dismiss);
  const jobs = allJobs.filter((job) => !dismissed.includes(job.id));
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
          <JobsSection title={t('jobs.sectionRunning')} jobs={running} onDismiss={dismiss} />
          <JobsSection title={t('jobs.sectionWaiting')} jobs={waiting} onDismiss={dismiss} />
          <JobsSection title={t('jobs.sectionFinished')} jobs={finished} onDismiss={dismiss} />
        </>
      )}
    </div>
  );
}

function JobsSection({ title, jobs, onDismiss }: {
  title: string;
  jobs: Job[];
  onDismiss: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  if (jobs.length === 0) return null;

  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1 text-xs uppercase tracking-wide text-editorial-muted">{title}</h3>
      <ul className="flex flex-col gap-1">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobRow job={job} onRemove={() => onDismiss([job.id])} removeLabel={t('jobs.dismiss')} />
          </li>
        ))}
      </ul>
    </section>
  );
}
