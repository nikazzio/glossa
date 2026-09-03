import { create } from 'zustand';

/**
 * Cosa sta facendo la rete, adesso.
 *
 * Serve a rispondere alla domanda «è collegato davvero o è piantato?»: un
 * lavoro fermo e un lavoro lento si vedono uguali finché nessuno dice quante
 * richieste sono in volo, quando è arrivata l'ultima risposta e a che velocità.
 */

/** Byte arrivati in un istante: la base della velocità osservata. */
interface Arrival {
  at: number;
  bytes: number;
}

/** Finestra su cui si misura la velocità: abbastanza corta da reagire, troppo
 * lunga per essere falsata da un singolo tassello. */
const SPEED_WINDOW_MS = 5_000;

interface NetworkActivityState {
  /** Richieste partite verso una biblioteca e non ancora concluse. */
  active: number;
  /** Richieste in attesa del proprio turno nella coda della finestra. */
  queued: number;
  /** Ultimo servizio con cui si è parlato. */
  lastHost: string | null;
  /** Quando è arrivata l'ultima risposta buona. */
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  arrivals: Arrival[];
  queue: () => void;
  start: (host: string | null) => void;
  succeed: (bytes: number) => void;
  fail: (message: string) => void;
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

export const useNetworkActivity = create<NetworkActivityState>((set, get) => ({
  active: 0,
  queued: 0,
  lastHost: null,
  lastOkAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  arrivals: [],

  queue: () => set((state) => ({ queued: state.queued + 1 })),

  start: (host) =>
    set((state) => ({
      queued: Math.max(0, state.queued - 1),
      active: state.active + 1,
      lastHost: host ?? state.lastHost,
    })),

  succeed: (bytes) =>
    set((state) => {
      const now = Date.now();
      return {
        active: Math.max(0, state.active - 1),
        lastOkAt: now,
        arrivals: [...state.arrivals, { at: now, bytes }].filter(
          (arrival) => now - arrival.at <= SPEED_WINDOW_MS,
        ),
      };
    }),

  fail: (message) =>
    set((state) => ({
      active: Math.max(0, state.active - 1),
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
