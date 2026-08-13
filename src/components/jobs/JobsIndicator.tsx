import { AlertCircle, Loader2, PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../ui';
import { formatEta } from '../../services/jobsService';
import { summarizeJobs, useJobsStore } from '../../stores/jobsStore';
import { useUiStore } from '../../stores/uiStore';

/**
 * Lo stato dei lavori in barra (D19).
 *
 * **Non è un pulsante**: nella barra di stato gli elementi sono testo e icone
 * cliccabili, senza contorno — il contorno lo hanno solo i comandi veri, e qui
 * l'unico è quello che apre il pannello. Tre elementi affiancati per due
 * funzioni facevano rumore.
 *
 * In barra restano il conteggio e il tempo che manca; il resto — quale lavoro
 * sta girando — arriva al passaggio del mouse.
 *
 * Quando tutto è fermo per rispettare i limiti di una biblioteca l'icona **non
 * gira**: animare un'attesa la farebbe leggere come avanzamento (D17).
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
  const failedOnly = summary.activeCount === 0;

  const short = failedOnly
    ? t('jobs.failedCount', { count: summary.failedCount })
    : [
        t('jobs.activeCount', { count: summary.activeCount }),
        summary.allWaiting
          ? eta
            ? t('jobs.waitingResumesIn', { eta })
            : t('jobs.waiting')
          : eta
            ? t('jobs.etaShort', { eta })
            : null,
      ]
        .filter(Boolean)
        .join(' · ');

  // Il dettaglio sta nel tooltip: in barra ci sta il minimo, e il nome della
  // fonte in lavorazione è lungo quanto vuole senza spostare niente.
  const detailed = [short, summary.current?.message].filter(Boolean).join(' · ');

  return (
    <Tooltip label={detailed} side="top">
      <button
        type="button"
        onClick={openJobs}
        aria-label={t('jobs.openPanel')}
        aria-pressed={isOnJobs}
        className={`flex min-w-0 max-w-[18rem] items-center gap-1.5 rounded px-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          isOnJobs ? 'text-editorial-accent' : 'text-editorial-muted hover:text-editorial-accent'
        }`}
      >
        {failedOnly ? (
          <AlertCircle size={11} className="shrink-0 text-editorial-danger" />
        ) : summary.allWaiting ? (
          <PauseCircle size={11} className="shrink-0" />
        ) : (
          <Loader2 size={11} className="shrink-0 animate-spin" />
        )}
        <span className={`truncate ${failedOnly ? 'text-editorial-danger' : ''}`}>{short}</span>
      </button>
    </Tooltip>
  );
}
