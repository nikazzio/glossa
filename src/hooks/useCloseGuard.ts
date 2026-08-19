import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { confirm } from '../stores/confirmStore';
import { isTerminal } from '../services/jobsService';
import { isRunning, useJobsStore } from '../stores/jobsStore';

/**
 * Chiusura dell'applicazione con lavori attivi (D12).
 *
 * Chiudendo Glossa i lavori si fermano — non esiste un processo che continui a
 * lavorare ad app chiusa (D10) — quindi prima si chiede conferma, con l'elenco,
 * e poi si mettono in pausa salvando il punto raggiunto. Annullarli sarebbe
 * inaccettabile: perdere venti minuti di scaricamento perché hai chiuso la
 * finestra.
 */
/**
 * Quanto si aspetta che i lavori si fermino davvero prima di chiudere. Oltre
 * questo si chiude comunque: niente va perduto — le pagine a metà non entrano nel
 * deposito (D16-bis) — e una finestra che non si chiude è peggio.
 */
const PAUSE_GRACE_MS = 5_000;
const PAUSE_POLL_MS = 200;

async function waitUntilStopped(): Promise<void> {
  const deadline = Date.now() + PAUSE_GRACE_MS;
  while (Date.now() < deadline) {
    if (!useJobsStore.getState().jobs.some(isRunning)) return;
    await new Promise((resolve) => setTimeout(resolve, PAUSE_POLL_MS));
  }
}

export function useCloseGuard() {
  const { t } = useTranslation();

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let stopped = false;

    const start = async () => {
      try {
        const appWindow = getCurrentWindow();
        const stop = await appWindow.onCloseRequested(async (event) => {
          const active = useJobsStore.getState().jobs.filter((job) => !isTerminal(job));
          if (active.length === 0) return;

          event.preventDefault();

          const names = active
            .slice(0, 5)
            .map((job) => job.message ?? t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType }))
            .join('\n');
          const confirmed = await confirm({
            title: t('jobs.closeTitle', { count: active.length }),
            message: `${t('jobs.closeMessage')}\n\n${names}`,
            confirmLabel: t('jobs.closeConfirm'),
          });
          if (!confirmed) return;

          // In pausa, non annullati: il punto raggiunto resta e alla riapertura
          // si riprende da lì (D13).
          const { pause } = useJobsStore.getState();
          await Promise.all(active.filter(isRunning).map((job) => pause(job.id).catch(() => {})));
          // La pausa è cooperativa (D14): chiedere non è fermare. Si dà ai
          // lavori il tempo di finire la pagina in corso, altrimenti la finestra
          // muore con lo stato «in pausa…» sul database, e a rimetterlo a posto
          // sarebbe il riavvio successivo.
          await waitUntilStopped();
          await appWindow.destroy();
        });
        if (stopped) stop();
        else unlisten = stop;
      } catch {
        // Fuori da Tauri (test, anteprima web) non c'è finestra da sorvegliare.
      }
    };
    void start();

    return () => {
      stopped = true;
      unlisten?.();
    };
  }, [t]);
}
