import { useEffect } from 'react';
import { useJobsStore } from '../stores/jobsStore';

/**
 * Collega l'interfaccia all'orchestratore: l'elenco arriva una volta
 * all'apertura, poi ogni cambiamento arriva come evento (D17).
 *
 * Va montato una sola volta, in cima all'applicazione: i lavori non
 * appartengono a nessuna schermata — uno scaricamento parte dalla Biblioteca e
 * continua mentre lavori altrove (D19).
 */
export function useJobsFeed() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let stopped = false;

    const start = async () => {
      try {
        await useJobsStore.getState().load();
        const stop = await useJobsStore.getState().subscribe();
        if (stopped) stop();
        else unlisten = stop;
      } catch {
        // Senza coda l'app resta usabile: non è un motivo per fermare l'avvio.
      }
    };
    void start();

    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);
}
