import { create } from 'zustand';
import type { RequestPriority } from './requestScheduler';

/**
 * Cosa sta facendo la rete, adesso.
 *
 * Serve a rispondere alla domanda «è collegato davvero o è piantato?»: un
 * lavoro fermo e un lavoro lento si vedono uguali finché nessuno dice quante
 * richieste sono in volo, con chi, e quanti byte stanno passando.
 *
 * Qui si conta solo quello che la finestra chiede. Quello che sa il motore —
 * posti in corsia, limite al minuto, raffreddamenti, provenienza delle immagini
 * — si chiede a lui con `networkProbe`, e solo mentre il pannello è aperto.
 */

/** Byte arrivati in un istante: la base della velocità osservata. */
interface Arrival {
  at: number;
  bytes: number;
}

/** Finestra su cui si misura la velocità: abbastanza corta da reagire, troppo
 * lunga per essere falsata da un singolo tassello. */
const SPEED_WINDOW_MS = 5_000;

/**
 * Le due cose che competono per la stessa corsia. Tenerle separate è l'unico
 * modo di vedere se le miniature stanno passando davanti alla pagina aperta.
 */
export type RequestKind = 'page' | 'thumbnails';

function kindOf(priority: RequestPriority): RequestKind {
  return priority === 'high' ? 'page' : 'thumbnails';
}

type Counters = Record<RequestKind, number>;

const NONE: Counters = { page: 0, thumbnails: 0 };

interface NetworkActivityState {
  /** Richieste partite e non ancora concluse, per tipo. */
  active: Counters;
  /** Richieste che aspettano il proprio turno nella coda della finestra. */
  queued: Counters;
  /** Ultimo servizio con cui si è parlato. */
  lastHost: string | null;
  /** Quando è arrivata l'ultima risposta buona. */
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  /** Immagini servite e byte consegnati alla finestra dall'avvio. */
  delivered: number;
  deliveredBytes: number;
  arrivals: Arrival[];
  queue: (priority: RequestPriority) => void;
  start: (priority: RequestPriority, host: string | null) => void;
  succeed: (priority: RequestPriority, bytes: number) => void;
  fail: (priority: RequestPriority, message: string) => void;
  drop: (priority: RequestPriority) => void;
  /** Byte al secondo nella finestra recente, `0` se non arriva niente. */
  speed: () => number;
}

/** L'host di un indirizzo, o `null` se non è un indirizzo remoto leggibile. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const add = (counters: Counters, kind: RequestKind, delta: number): Counters => ({
  ...counters,
  [kind]: Math.max(0, counters[kind] + delta),
});

export const useNetworkActivity = create<NetworkActivityState>((set, get) => ({
  active: NONE,
  queued: NONE,
  lastHost: null,
  lastOkAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  delivered: 0,
  deliveredBytes: 0,
  arrivals: [],

  queue: (priority) =>
    set((state) => ({ queued: add(state.queued, kindOf(priority), 1) })),

  drop: (priority) =>
    set((state) => ({ queued: add(state.queued, kindOf(priority), -1) })),

  start: (priority, host) =>
    set((state) => {
      const kind = kindOf(priority);
      return {
        queued: add(state.queued, kind, -1),
        active: add(state.active, kind, 1),
        lastHost: host ?? state.lastHost,
      };
    }),

  succeed: (priority, bytes) =>
    set((state) => {
      const now = Date.now();
      return {
        active: add(state.active, kindOf(priority), -1),
        lastOkAt: now,
        delivered: state.delivered + 1,
        deliveredBytes: state.deliveredBytes + bytes,
        arrivals: [...state.arrivals, { at: now, bytes }].filter(
          (arrival) => now - arrival.at <= SPEED_WINDOW_MS,
        ),
      };
    }),

  fail: (priority, message) =>
    set((state) => ({
      active: add(state.active, kindOf(priority), -1),
      lastErrorAt: Date.now(),
      lastErrorMessage: message,
    })),

  speed: () => {
    const now = Date.now();
    const recent = get().arrivals.filter((arrival) => now - arrival.at <= SPEED_WINDOW_MS);
    if (recent.length === 0) return 0;
    const bytes = recent.reduce((total, arrival) => total + arrival.bytes, 0);
    return Math.round((bytes * 1000) / SPEED_WINDOW_MS);
  },
}));
