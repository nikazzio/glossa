import { useEffect } from 'react';
import { toast } from 'sonner';
import i18next from 'i18next';
import { useJobsStore } from '../stores/jobsStore';
import { isTerminal } from '../services/jobsService';
import { confirm } from '../stores/confirmStore';
import { logger } from '../utils/logger';
import {
  clearRestoreCheck,
  missingAfterRestore,
  pendingRestoreCheck,
  redownload,
} from '../services/restoreFollowUp';

/**
 * Aspetta il controllo del deposito messo in coda da un ripristino, e solo
 * allora propone di riprendere quello che manca (#345, D31).
 *
 * **Dopo il controllo, non prima**: proporre subito voleva dire proporre tutto,
 * comprese le pagine che sul disco c'erano già — ed è così che uno scaricamento
 * da centinaia di pagine ripartiva per niente.
 *
 * Va montato una sola volta, in cima all'applicazione: il controllo può finire
 * molto dopo il ripristino, e anche in una sessione successiva.
 */
export function useRestoreFollowUp() {
  useEffect(() => {
    let done = false;

    const finish = async (jobId: string) => {
      if (done) return;
      done = true;
      const pending = await pendingRestoreCheck();
      // Un altro ripristino nel frattempo ha cambiato l'attesa: quella nuova ha
      // il suo controllo, e questo non la riguarda più.
      if (!pending || pending.jobId !== jobId) return;
      await clearRestoreCheck();

      const { works, unrestorable } = await missingAfterRestore(pending.downloaded);
      logger.info('restore.check.done', {
        jobId,
        incompleteWorks: works.length,
        unrestorableSizes: unrestorable.length,
      });

      // Le pagine prese a parte a un'altra misura non si riaccodano: uno
      // scaricamento le prenderebbe tutte invece di quelle poche (§5.6). Si
      // dicono, e restano da riprendere una per una.
      if (unrestorable.length > 0) {
        const pages = unrestorable.reduce((total, size) => total + size.pages, 0);
        toast.info(i18next.t('files.restoreExtraSizes', { count: pages }), {
          description: unrestorable
            .map((size) => `${size.title} · ${size.sizeTag} · ${size.pages}`)
            .join('\n'),
        });
      }

      if (works.length === 0) {
        if (unrestorable.length === 0) toast.success(i18next.t('files.restoreAllPresent'));
        return;
      }

      const pages = works.reduce((total, work) => total + (work.expected - work.present), 0);
      const wanted = await confirm({
        title: i18next.t('files.restoreMissingTitle', { count: works.length }),
        message: i18next.t('files.restoreMissingMessage', { count: pages }),
        confirmLabel: i18next.t('files.backupRedownloadConfirm'),
      });
      if (!wanted) return;

      const failed = await redownload(works);
      if (failed > 0) toast.warning(i18next.t('files.backupRedownloadPartial', { count: failed }));
    };

    const check = (jobs: ReturnType<typeof useJobsStore.getState>['jobs'], jobId: string) => {
      const job = jobs.find((candidate) => candidate.id === jobId);
      if (job && isTerminal(job)) void finish(jobId);
    };

    let unsubscribe: (() => void) | null = null;
    void pendingRestoreCheck().then((pending) => {
      if (!pending) return;
      // Il controllo può essere già finito: succede riaprendo l'applicazione.
      check(useJobsStore.getState().jobs, pending.jobId);
      unsubscribe = useJobsStore.subscribe((state) => check(state.jobs, pending.jobId));
    });

    return () => {
      done = true;
      unsubscribe?.();
    };
  }, []);
}
