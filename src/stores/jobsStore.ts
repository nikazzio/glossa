import { create } from 'zustand';
import { toast } from 'sonner';
import i18next from 'i18next';
import { logger } from '../utils/logger';
import {
  cancelJob,
  isTerminal,
  isWaitingToRetry,
  listActiveJobs,
  onJobChanged,
  pauseJob,
  resumeJob,
  retryJob,
  type Job,
} from '../services/jobsService';

/**
 * I lavori in background, per l'interfaccia.
 *
 * Stato globale vero: uno scaricamento parte dalla Biblioteca e continua mentre
 * lavori altrove (D19), quindi l'indicatore non può appartenere a una schermata.
 *
 * L'elenco arriva una volta all'avvio e poi si aggiorna **per eventi** (D17):
 * niente letture a intervalli, che con un lavoro fermo dieci minuti dopo un 403
 * sarebbero centinaia di interrogazioni inutili.
 */

/** Quanto resta visibile un lavoro finito nel pannello: la giornata (D20). */
const FINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;

interface JobsState {
  jobs: Job[];
  isLoaded: boolean;
  load: () => Promise<void>;
  subscribe: () => Promise<() => void>;
  applyChange: (job: Job) => void;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  retry: (id: string, fromScratch?: boolean) => Promise<void>;
}

/** Esegue un comando sulla coda, e se fallisce lo dice invece di inghiottirlo. */
async function run(action: string, id: string, command: () => Promise<void>): Promise<void> {
  try {
    await command();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`jobs: ${action} fallito`, { id, message });
    toast.error(i18next.t('jobs.commandFailed'), { description: message });
  }
}

function replace(jobs: Job[], changed: Job): Job[] {
  const known = jobs.some((job) => job.id === changed.id);
  return known ? jobs.map((job) => (job.id === changed.id ? changed : job)) : [...jobs, changed];
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: [],
  isLoaded: false,

  load: async () => {
    const jobs = await listActiveJobs();
    set({ jobs, isLoaded: true });
  },

  subscribe: async () => onJobChanged((job) => get().applyChange(job)),

  applyChange: (job) => set((state) => ({ jobs: replace(state.jobs, job) })),

  // Un comando che fallisce deve dirlo. Prima l'errore spariva: il pulsante
  // sembrava non fare niente e non restava traccia da nessuna parte.
  pause: async (id) => {
    await run('pause', id, () => pauseJob(id));
  },
  resume: async (id) => {
    await run('resume', id, () => resumeJob(id));
  },
  cancel: async (id) => {
    await run('cancel', id, () => cancelJob(id));
  },
  retry: async (id, fromScratch = false) => {
    await run('retry', id, () => retryJob(id, fromScratch));
  },
}));

/** In corso davvero: sta girando, o si sta fermando. */
export function isRunning(job: Job): boolean {
  return job.status === 'running' || job.status === 'pausing' || job.status === 'cancelling';
}

/**
 * Fermo in attesa: aspetta di poter riprovare, oppure aspetta una decisione
 * dell'utente. Non è un errore, e va detto diversamente (D17).
 */
export function isWaiting(job: Job): boolean {
  return isWaitingToRetry(job) || job.status === 'paused' || job.status === 'queued';
}

/** Finito oggi: resta visibile per la giornata, poi sparisce (D20). */
export function isFinishedRecently(job: Job, now: number): boolean {
  if (!isTerminal(job)) return false;
  if (!job.updatedAt) return true;
  const finishedAt = Date.parse(job.updatedAt.replace(' ', 'T') + 'Z');
  return Number.isNaN(finishedAt) ? true : now - finishedAt < FINISHED_WINDOW_MS;
}

export interface JobsSummary {
  /** Quanti lavori non sono ancora finiti. */
  activeCount: number;
  /** Quello di cui mostrare il nome nella barra: il primo in esecuzione. */
  current: Job | null;
  /**
   * Quanto manca, in secondi. La somma di tutti gli attivi quando ognuno sa
   * dire la sua; altrimenti la stima del lavoro in corso, che è comunque un
   * dato vero — meglio del nulla, che fa sembrare la coda bloccata (D17).
   */
  etaSeconds: number | null;
  /** Nessuno sta girando: sono tutti fermi ad aspettare. */
  allWaiting: boolean;
  failedCount: number;
}

/**
 * Il riassunto che va in barra di stato. Ricavato qui e non nel componente
 * perché lo usano sia l'indicatore sia il pannello.
 */
export function summarizeJobs(jobs: Job[]): JobsSummary {
  const active = jobs.filter((job) => !isTerminal(job));
  const running = active.filter(isRunning);
  const etas = active.map((job) => job.etaSeconds).filter((eta): eta is number => eta !== null);

  return {
    activeCount: active.length,
    current: running[0] ?? null,
    // Sommare stime parziali darebbe un totale falso, più basso del vero: in
    // quel caso si mostra la stima del lavoro in corso, che è un dato onesto.
    etaSeconds:
      etas.length > 0 && etas.length === active.length
        ? etas.reduce((a, b) => a + b, 0)
        : (running[0]?.etaSeconds ?? null),
    allWaiting: active.length > 0 && running.length === 0,
    failedCount: jobs.filter((job) => job.status === 'error').length,
  };
}
