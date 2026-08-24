import { Pause, Play, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isRunning, useJobsStore } from '../../stores/jobsStore';
import { isTerminal, isWaitingToRetry } from '../../services/jobsService';
import { TerminalIconButton } from './TerminalIconButton';

/**
 * Metti in pausa tutto / riprendi tutto.
 *
 * Con uno scaricamento da un quarto d'ora e una coda di pagine, fermare a mano
 * dieci righe una per una non è un'operazione: è una punizione. Compaiono solo
 * quando c'è davvero qualcosa da fermare o da riprendere.
 */
export function JobsBulkControls() {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const pause = useJobsStore((state) => state.pause);
  const resume = useJobsStore((state) => state.resume);
  const clearFinished = useJobsStore((state) => state.clearFinished);

  const running = jobs.filter((job) => job.status === 'running');
  const resumable = jobs.filter((job) => job.status === 'paused' || isWaitingToRetry(job));
  const pausable = jobs.filter((job) => isRunning(job) || job.status === 'queued');
  const finished = jobs.filter(isTerminal);

  return (
    <div className="flex items-center gap-1">
      {pausable.length > 0 && (
        <TerminalIconButton
          label={t('jobs.pauseAll', { count: pausable.length })}
          onClick={() => pausable.forEach((job) => void pause(job.id))}
        >
          <Pause size={12} />
        </TerminalIconButton>
      )}
      {resumable.length > 0 && running.length === 0 && (
        <TerminalIconButton
          label={t('jobs.resumeAll', { count: resumable.length })}
          onClick={() => resumable.forEach((job) => void resume(job.id))}
        >
          <Play size={12} />
        </TerminalIconButton>
      )}
      {finished.length > 0 && (
        <TerminalIconButton
          label={t('jobs.clearFinished', { count: finished.length })}
          onClick={() => void clearFinished()}
        >
          <Trash2 size={12} />
        </TerminalIconButton>
      )}
    </div>
  );
}
