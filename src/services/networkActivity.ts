import { create } from 'zustand';
import type { RequestPriority } from './requestScheduler';

/**
 * Cosa sta facendo la rete, adesso.
 *
 * Qui si conta **solo quello che la finestra sta aspettando**: quante immagini
 * ha chiesto e non ha ancora ricevuto, divise fra pagina aperta e miniature.
 *
 * Non si conta niente di più. Da qui non si vede se una risposta è arrivata
 * dalla rete, dal deposito o dalla cache: contarle tutte come rete faceva
 * segnare velocità e «collegato» anche sfogliando un libro tutto sul computer.
 * Quello lo sa solo il motore, e glielo si chiede con `networkProbe` mentre il
 * pannello è aperto.
 */

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
  /** Ultimo servizio a cui è stata indirizzata una richiesta. */
  lastHost: string | null;
  /** Quando è arrivata l'ultima risposta, da qualunque parte venisse. */
  lastAnswerAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  queue: (priority: RequestPriority) => void;
  start: (priority: RequestPriority, host: string | null) => void;
  succeed: (priority: RequestPriority) => void;
  fail: (priority: RequestPriority, message: string) => void;
  drop: (priority: RequestPriority) => void;
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

export const useNetworkActivity = create<NetworkActivityState>((set) => ({
  active: NONE,
  queued: NONE,
  lastHost: null,
  lastAnswerAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,

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

  succeed: (priority) =>
    set((state) => ({
      active: add(state.active, kindOf(priority), -1),
      lastAnswerAt: Date.now(),
    })),

  fail: (priority, message) =>
    set((state) => ({
      active: add(state.active, kindOf(priority), -1),
      lastErrorAt: Date.now(),
      lastErrorMessage: message,
    })),

}));
