import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * I lavori in background.
 * Decisioni in `docs-dev/BLOCCO_1_DECISIONI.md`, parte C.
 *
 * L'interfaccia **non esegue niente di lungo** (D10): chiede la creazione di un
 * lavoro all'orchestratore e poi ascolta. Non interroga il database a
 * intervalli: ogni cambio arriva come evento (D17).
 */

/** Evento emesso dall'orchestratore a ogni cambiamento di un lavoro. */
const JOB_EVENT = 'jobs:updated';

/**
 * `pausing` e `cancelling` esistono perché pausa e annullamento sono
 * cooperativi (D14, D15): il lavoro si ferma al confine dell'unità di lavoro
 * successiva, non all'istante. L'interfaccia deve mostrare "in pausa…" e poi
 * "in pausa", senza fingere che sia immediato.
 */
export type JobStatus =
  | 'queued'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'error';

/** Classificazione degli errori (D16): decide se e quando si ritenta. */
export type JobErrorKind =
  | 'transport'
  | 'rateLimited'
  | 'throttled'
  | 'notFound'
  | 'storage'
  | 'format'
  | 'internal';

export interface Job {
  id: string;
  jobType: string;
  status: JobStatus;
  priority: number;
  progress: number;
  message: string | null;
  config: string;
  checkpoint: string | null;
  attemptCount: number;
  maxAttempts: number;
  error: string | null;
  errorKind: JobErrorKind | null;
  etaSeconds: number | null;
  /**
   * Perché è fermo pur essendo in corso: sta rispettando i limiti della
   * biblioteca, non è fallito (D17). Immobilità con due significati opposti,
   * da dire in modo diverso.
   */
  waitingReason: string | null;
  dependsOnJobId: string | null;
  nextAttemptAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NewJobRequest {
  jobType: string;
  id?: string;
  config?: string;
  priority?: number;
  maxAttempts?: number;
  dependsOnJobId?: string;
  workspaceId?: string;
}

export async function createJob(request: NewJobRequest): Promise<Job> {
  return invoke<Job>('create_job', { request });
}

/**
 * I lavori non ancora finiti. Lo storico arriverà con l'area Analisi.
 *
 * La risposta viene controllata invece che data per buona: fuori da Tauri — le
 * prove nel browser, un'anteprima web — il comando non esiste e la risposta non
 * è un elenco. Senza questo controllo l'intera interfaccia si romperebbe per
 * una coda che in quel contesto non può nemmeno esistere.
 */
export async function listActiveJobs(): Promise<Job[]> {
  const answer = await invoke<Job[] | null>('list_active_jobs');
  return Array.isArray(answer) ? answer : [];
}

export async function getJob(id: string): Promise<Job | null> {
  return invoke<Job | null>('get_job', { id });
}

export async function pauseJob(id: string): Promise<void> {
  await invoke('pause_job', { id });
}

/** Riparte dal punto salvato, non da capo (D13). */
export async function resumeJob(id: string): Promise<void> {
  await invoke('resume_job', { id });
}

/** Un lavoro annullato è terminale: si ripete da capo, non si riprende (D15). */
export async function cancelJob(id: string): Promise<void> {
  await invoke('cancel_job', { id });
}

/**
 * Mette in coda lo scaricamento di una digitalizzazione. L'interfaccia non
 * scarica niente: chiede un lavoro e osserva (D10).
 */
export async function enqueueSourceDownload(request: {
  providerKey: string;
  manifestUrl: string;
  /** Se manca, la digitalizzazione si ritrova dall'indirizzo del manifesto. */
  versionId?: string;
  sizeTag?: string;
}): Promise<Job> {
  return invoke<Job>('enqueue_source_download', request);
}

export async function retryJob(id: string, fromScratch = false): Promise<void> {
  await invoke('retry_job', { id, fromScratch });
}

/**
 * Ascolta i cambiamenti dei lavori. Restituisce la funzione per smettere.
 */
export async function onJobChanged(handler: (job: Job) => void): Promise<() => void> {
  return listen<Job>(JOB_EVENT, (event) => handler(event.payload));
}

/**
 * Un lavoro è fermo in attesa di poter riprovare: non è fallito, e la barra non
 * deve fingere di avanzare (D17). Con i limiti delle biblioteche l'attesa può
 * durare minuti.
 */
export function isWaitingToRetry(job: Job): boolean {
  return job.status === 'queued' && job.nextAttemptAt !== null;
}

/**
 * Il lavoro sta girando ma è fermo per rispettare i limiti della biblioteca
 * (D18): con i profili tarati può restare immobile per minuti. È la stessa
 * immobilità di un errore con il significato opposto, e va detta diversamente.
 */
export function isWaitingForLibrary(job: Job): boolean {
  return job.waitingReason === 'libraryLimits';
}

/** Un lavoro finito non cambia più stato: né ripartenze né aggiornamenti tardivi. */
export function isTerminal(job: Job): boolean {
  return job.status === 'completed' || job.status === 'cancelled' || job.status === 'error';
}

/**
 * Il tempo che manca, in forma leggibile. D17 lo rende obbligatorio: un lavoro
 * che dura un quarto d'ora senza stima sembra bloccato.
 */
export function formatEta(etaSeconds: number | null): string | null {
  if (etaSeconds === null || etaSeconds < 0) return null;
  if (etaSeconds < 60) return `${Math.round(etaSeconds)} s`;
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
