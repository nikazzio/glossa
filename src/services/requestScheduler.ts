export type RequestPriority = 'high' | 'normal' | 'low';

export interface ScheduleOptions {
  priority?: RequestPriority;
  signal?: AbortSignal;
}

interface QueueEntry {
  priority: RequestPriority;
  start: () => void;
  cancel: () => void;
  cancelled: () => boolean;
}

const PRIORITIES: RequestPriority[] = ['high', 'normal', 'low'];

/**
 * Limita le richieste di rete già partite e lascia passare avanti la pagina che
 * si sta guardando.
 *
 * Una richiesta già partita non è interrompibile: il limite serve a tenere
 * piccolo il residuo — non centinaia di miniature attraversate da uno
 * scorrimento veloce — e a lasciare sempre qualche posto libero, così i tasselli
 * della pagina aperta non si mettono in fila dietro a quelle miniature.
 *
 * `reservedForHigh` è quella riserva: le miniature non possono occupare tutti i
 * posti, esattamente come nel motore uno scaricamento non occupa tutti i posti
 * verso una biblioteca.
 */
export function createRequestScheduler(maxActive: number, reservedForHigh = 0) {
  const queues: Record<RequestPriority, QueueEntry[]> = { high: [], normal: [], low: [] };
  const ceiling = Math.max(1, maxActive);
  const ceilingForTheRest = Math.max(1, ceiling - Math.max(0, reservedForHigh));
  let active = 0;
  let activeBelowHigh = 0;

  const next = (): QueueEntry | null => {
    for (const priority of PRIORITIES) {
      const queue = queues[priority];
      while (queue.length > 0 && queue[0].cancelled()) queue.shift();
      if (queue.length === 0) continue;
      // I posti riservati restano tali: chi non è la pagina aperta aspetta.
      if (priority !== 'high' && activeBelowHigh >= ceilingForTheRest) continue;
      return queue.shift() ?? null;
    }
    return null;
  };

  const pump = () => {
    while (active < ceiling) {
      const entry = next();
      if (!entry) return;
      active += 1;
      if (entry.priority !== 'high') activeBelowHigh += 1;
      entry.start();
    }
  };

  const schedule = <T>(run: () => Promise<T>, options: ScheduleOptions = {}): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const { priority = 'normal', signal } = options;
      let started = false;
      let cancelled = signal?.aborted ?? false;
      const abortError = () => new DOMException('Request cancelled', 'AbortError');
      const onAbort = () => {
        if (started || cancelled) return;
        cancelled = true;
        // Tolta subito dalla coda, non solo marcata: scartarla quando risale in
        // testa significa tenerne centinaia vive dopo uno scorrimento veloce,
        // e se il rail sparisce non risalgono mai.
        const queue = queues[priority];
        const waiting = queue.indexOf(entry);
        if (waiting >= 0) queue.splice(waiting, 1);
        reject(abortError());
      };
      const entry: QueueEntry = {
        priority,
        cancelled: () => cancelled,
        cancel: onAbort,
        start: () => {
          started = true;
          signal?.removeEventListener('abort', onAbort);
          void run()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              if (priority !== 'high') activeBelowHigh -= 1;
              pump();
            });
        },
      };
      if (cancelled) {
        reject(abortError());
        return;
      }
      signal?.addEventListener('abort', entry.cancel, { once: true });
      queues[entry.priority].push(entry);
      pump();
    });

  return { schedule };
}
