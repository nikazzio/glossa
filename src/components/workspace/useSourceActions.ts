import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useJobsStore, stillReasonOf } from '../../stores/jobsStore';
import { confirm } from '../../stores/confirmStore';
import { enqueueSourceDownload, isTerminal } from '../../services/jobsService';
import { versionProviderKey } from '../../services/libraryService';
import { versionInventory } from '../../services/inventoryService';
import { enqueueOptimization } from '../../services/optimizeService';
import {
  deleteVersionFiles,
  freeVersionPages,
  summarizeAvailability,
} from '../../services/vaultService';
import { humanSize } from '../../utils';
import type { LibraryCatalogEntry } from '../../types';

interface SourceActionHandlers {
  /** L'opera è stata tolta dalla Biblioteca: la scheda non esiste più. */
  onRemove: () => void;
  onSetArchived: (archived: boolean) => Promise<void>;
  /** Qualcosa sul disco è cambiato: il catalogo va riletto. */
  onRefresh: () => void;
}

/**
 * Le azioni di un'opera, in un posto solo: le usano sia la riga del catalogo
 * sia la sua scheda, e due copie della stessa conferma prima o poi divergono.
 */
export function useSourceActions(entry: LibraryCatalogEntry, handlers: SourceActionHandlers) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);

  const runningJob = jobs.find((job) => job.id === `download:${entry.versionId}` && !isTerminal(job));
  const jobState = runningJob ? stillReasonOf(runningJob) : null;
  const archived = entry.source.status === 'archived';

  const principal = entry.sizes.find((size) => size.sizeTag === entry.principalSize);
  const summary = summarizeAvailability(
    entry.localPages,
    entry.expectedPages ?? 0,
    principal?.missing ?? 0,
  );

  // La chiave della biblioteca sta nel deposito: chiederla al motore a ogni
  // comando significa un viaggio in più per ogni click, e per la stessa copia
  // la risposta non cambia. Si chiede una volta e si tiene, finché la scheda
  // guarda la stessa copia.
  const cachedProviderKey = useRef<{ signature: string; key: string } | null>(null);
  const providerKey = async () => {
    // La chiave vale per **questa** copia e per la provenienza che dichiara:
    // se una delle due cambia, quella tenuta non vale più.
    const signature = `${entry.versionId ?? ''}:${entry.providerKey ?? ''}`;
    const cached = cachedProviderKey.current;
    if (cached && cached.signature === signature) return cached.key;
    const key =
      (entry.versionId ? await versionProviderKey(entry.versionId) : null) ??
      entry.providerKey ??
      'generic';
    cachedProviderKey.current = { signature, key };
    return key;
  };

  const startDownload = async () => {
    if (!entry.manifestUrl) return;
    setBusy(true);
    try {
      const job = await enqueueSourceDownload({
        providerKey: await providerKey(),
        manifestUrl: entry.manifestUrl,
        versionId: entry.versionId ?? undefined,
      });
      applyChange(job);
      toast.success(t('areas.library.downloadQueued'));
    } catch (error: unknown) {
      toast.error(t('areas.library.downloadFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!entry.versionId) return;
    setBusy(true);
    try {
      const inventory = await versionInventory(entry.versionId);
      const principalSize = inventory?.sizes.find((size) => size.sizeTag === inventory.principal);
      if (!principalSize) {
        toast.info(t('areas.library.verifyNothing'));
        return;
      }
      const expected = entry.expectedPages ?? 0;
      if (expected <= 0) {
        toast.info(t('areas.library.verifyNoExpected', { count: principalSize.pages }));
        return;
      }
      const missing = Math.max(0, expected - principalSize.pages - principalSize.missing);
      if (missing === 0) {
        toast.success(t('areas.library.verifyIntact', { count: principalSize.pages }));
        return;
      }
      const confirmed = await confirm({
        title: t('areas.library.verifyMissingTitle', { count: missing }),
        message: t('areas.library.verifyMissingMessage', { total: expected }),
        confirmLabel: t('areas.library.verifyDownloadMissing'),
      });
      if (confirmed) await startDownload();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(
        reason.includes('vault_unreachable')
          ? t('areas.library.vaultUnreachable')
          : t('areas.library.verifyFailed'),
        { description: reason },
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * La cancellazione vera delle pagine, senza chiedere: la domanda la fa chi
   * chiama, perché arriva da due strade diverse (comando diretto e
   * archiviazione).
   *
   * `trackBusy` è spento quando la riga può essere già sparita dall'elenco —
   * dopo l'archiviazione, se la vista nasconde le archiviate: segnare
   * «occupato» su una riga che non c'è più significa scrivere su un componente
   * smontato.
   */
  const runFreeSpace = async (trackBusy = true) => {
    if (!entry.versionId) return;
    if (trackBusy) setBusy(true);
    try {
      const freed = await freeVersionPages(await providerKey(), entry.versionId);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      handlers.onRefresh();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.freeSpaceFailed'), { description: reason });
    } finally {
      if (trackBusy) setBusy(false);
    }
  };

  const freeSpace = async () => {
    if (!entry.versionId) return;
    const confirmed = await confirm({
      title: t('areas.library.freeSpaceTitle', { size: humanSize(entry.localBytes) }),
      message: t('areas.library.freeSpaceMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (confirmed) await runFreeSpace();
  };

  /**
   * Archiviare tocca il catalogo, non il disco. Se però quell'opera occupa
   * spazio, è il momento naturale per proporre di liberarlo: la proposta resta
   * una domanda a parte, così l'archiviazione non cancella niente di nascosto.
   */
  const toggleArchived = async () => {
    if (archived) {
      // Anche riportare in catalogo tiene i comandi spenti finché non è
      // finito: due click di seguito sarebbero due richieste.
      setBusy(true);
      try {
        await handlers.onSetArchived(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await handlers.onSetArchived(true);
    } finally {
      setBusy(false);
    }
    if (entry.localPages === 0) return;
    const alsoFree = await confirm({
      title: t('areas.library.archiveFreeTitle', { size: humanSize(entry.localBytes) }),
      message: t('areas.library.archiveFreeMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (alsoFree) await runFreeSpace(false);
  };

  const optimise = async () => {
    if (!entry.versionId || !entry.principalSize) return;
    setBusy(true);
    try {
      const job = await enqueueOptimization(entry.versionId, entry.principalSize);
      applyChange(job);
      toast.success(t('areas.library.optimizeQueued'));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('download_in_corso')) {
        toast.info(t('areas.library.optimizeWhileDownloading'));
        return;
      }
      toast.error(t('areas.library.optimizeFailed'), { description: reason });
    } finally {
      setBusy(false);
    }
  };

  const askRemoval = async () => {
    const confirmed = await confirm({
      title: t('areas.library.removeTitle', { title: entry.source.title }),
      message:
        entry.localBytes > 0
          ? t('areas.library.removeMessageWithFiles', { size: humanSize(entry.localBytes) })
          : t('areas.library.removeMessage'),
      confirmLabel: t('areas.library.removeConfirm'),
      danger: true,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      if (entry.versionId) {
        await deleteVersionFiles(await providerKey(), entry.versionId);
      }
      handlers.onRemove();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.removeFailed'), { description: reason });
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    runningJob,
    jobState,
    archived,
    summary,
    startDownload,
    verify,
    freeSpace,
    toggleArchived,
    optimise,
    askRemoval,
  };
}

export type SourceActions = ReturnType<typeof useSourceActions>;
