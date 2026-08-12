import { ListChecks, Loader2, PauseCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '../ui';
import { formatEta, type Job } from '../../services/jobsService';
import { summarizeJobs, useJobsStore } from '../../stores/jobsStore';
import { useUiStore } from '../../stores/uiStore';

/**
 * L'indicatore dei lavori in barra di stato (D19).
 *
 * **Sempre presente**, non solo dove il lavoro è stato avviato: uno scaricamento
 * parte dalla Biblioteca e prosegue mentre si lavora altrove. Compatto e denso:
 * quanti lavori, quello corrente, tempo stimato.
 *
 * Quando tutto è fermo per rispettare i limiti di una biblioteca — frequente,
 * con i profili di rete — **l'icona non gira**: animare un'attesa la farebbe
 * sembrare avanzamento, ed è il caso peggiore (D17).
 */
export function JobsIndicator() {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const showDrawer = useUiStore((state) => state.showConsoleDrawer);
  const setShowDrawer = useUiStore((state) => state.setShowConsoleDrawer);
  const setDrawerTab = useUiStore((state) => state.setDrawerTab);
  const drawerTab = useUiStore((state) => state.drawerTab);

  const summary = summarizeJobs(jobs);
  const isOnJobs = showDrawer && drawerTab === 'jobs';

  if (summary.activeCount === 0 && summary.failedCount === 0) return null;

  const openJobs = () => {
    setDrawerTab('jobs');
    setShowDrawer(!isOnJobs);
  };

  const eta = formatEta(summary.etaSeconds);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <IconButton
        size="xs"
        tone={isOnJobs ? 'accent' : 'default'}
        onClick={openJobs}
        title={t('jobs.openPanel')}
        ariaPressed={isOnJobs}
        tooltipSide="top"
      >
        {summary.failedCount > 0 && summary.activeCount === 0 ? (
          <AlertCircle size={11} />
        ) : summary.allWaiting ? (
          <PauseCircle size={11} />
        ) : summary.activeCount > 0 ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <ListChecks size={11} />
        )}
      </IconButton>
      <JobsSummaryText
        activeCount={summary.activeCount}
        failedCount={summary.failedCount}
        allWaiting={summary.allWaiting}
        current={summary.current}
        eta={eta}
      />
    </div>
  );
}

function JobsSummaryText({
  activeCount,
  failedCount,
  allWaiting,
  current,
  eta,
}: {
  activeCount: number;
  failedCount: number;
  allWaiting: boolean;
  current: Job | null;
  eta: string | null;
}) {
  const { t } = useTranslation();

  if (activeCount === 0) {
    return (
      <span className="truncate text-xs text-editorial-danger">
        {t('jobs.failedCount', { count: failedCount })}
      </span>
    );
  }

  const pieces = [t('jobs.activeCount', { count: activeCount })];
  if (allWaiting) {
    pieces.push(eta ? t('jobs.waitingResumesIn', { eta }) : t('jobs.waiting'));
  } else {
    if (current?.message) pieces.push(current.message);
    if (eta) pieces.push(t('jobs.etaShort', { eta }));
  }

  const line = pieces.join(' · ');

  return (
    <Tooltip label={line} side="top">
      <span className="truncate text-xs text-editorial-muted">{line}</span>
    </Tooltip>
  );
}
