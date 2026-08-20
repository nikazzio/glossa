import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWorkspaceStore } from '../stores/workspaceStore';

/**
 * I lavori in background.
 * Decisioni in `docs-dev/BLOCCO_1_DECISIONI.md`, parte C.
 *
 * L'interfaccia **non esegue niente di lungo**: chiede la creazione di un
 * lavoro all'orchestratore e poi ascolta. Non interroga il database a
 * intervalli: ogni cambio arriva come evento.
 */

/** Evento emesso dall'orchestratore a ogni cambiamento di un lavoro. */
const JOB_EVENT = 'jobs:updated';

/**
 * `pausing` e `cancelling` esistono perché pausa e annullamento sono
 * cooperativi: il lavoro si ferma al confine dell'unità di lavoro
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

/** Classificazione degli errori: decide se e quando si ritenta. */
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
   * biblioteca, non è fallito. Immobilità con due significati opposti,
   * da dire in modo diverso.
   */
  waitingReason: string | null;
  /**
   * Cosa sta facendo adesso, dentro lo stato: `manifest`,
   * `downloading`… Il vocabolario lo decide il tipo di lavoro, l'interfaccia lo
   * traduce e mostra la chiave grezza per quelle che non conosce ancora.
   */
  phase: string | null;
  /** Dettagli strutturati in JSON, scritti dal gestore. Vedi `parseJobDetail`. */
  detail: string | null;
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

/** Riparte dal punto salvato, non da capo. */
export async function resumeJob(id: string): Promise<void> {
  await invoke('resume_job', { id });
}

/** Un lavoro annullato è terminale: si ripete da capo, non si riprende. */
export async function cancelJob(id: string): Promise<void> {
  await invoke('cancel_job', { id });
}

/**
 * Mette in coda lo scaricamento di una digitalizzazione: le pagine e le sue
 * miniature, che sono due lavori distinti. L'interfaccia non scarica
 * niente: chiede e osserva. Restituisce il lavoro delle pagine.
 */
export async function enqueueSourceDownload(request: {
  providerKey: string;
  manifestUrl: string;
  /** Se manca, la digitalizzazione si ritrova dall'indirizzo del manifesto. */
  versionId?: string;
  sizeTag?: string;
}): Promise<Job> {
  // Da quale workspace parte la richiesta lo sa solo l'interfaccia, e i fatti
  // del lavoro ci si raggruppano sopra: senza, restavano senza padrone.
  return invoke<Job>('enqueue_source_download', {
    ...request,
    workspaceId: useWorkspaceStore.getState().activeWorkspace?.id ?? null,
  });
}

/**
 * Mette in coda la verifica del deposito. Rapida di default; completa
 * su richiesta esplicita, perché apre ogni file.
 */
export async function enqueueVaultVerification(full = false): Promise<Job> {
  return invoke<Job>('enqueue_vault_verification', { full });
}

/**
 * Toglie dall'elenco i lavori già finiti. Senza `id` li toglie tutti: sono
 * righe di storico, e quando diventano rumore si buttano.
 */
export async function clearFinishedJobs(id?: string): Promise<number> {
  return invoke<number>('clear_finished_jobs', { id });
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
 * I dettagli che un lavoro sa dire di sé.
 *
 * Le chiavi le decide il gestore: uno scaricamento parla di pagine, megabyte e
 * risoluzione, una verifica di file integri e orfani. Qui si dichiara quello che
 * l'interfaccia sa mostrare — il resto viene ignorato invece di comparire a
 * metà, e un gestore futuro può aggiungere chiavi senza rompere niente.
 */
export interface JobDetail {
  units?: { done: number; total: number; label: string };
  bytes?: { downloaded: number; estimated: number };
  /** L'ultima unità passata: qui i dati **veri** di quella pagina. */
  last?: {
    index: number;
    /** L'etichetta che le dà la biblioteca: «f. 17r», «p. 24». */
    label?: string;
    /**
     * Quanto pesa. Assente per una pagina **ritrovata** sul disco: non è stata
     * scaricata adesso, e mostrare zero sarebbe peggio che non mostrare niente.
     */
    bytes?: number;
    /** La misura chiesta per questa pagina, che non è il tetto. */
    size?: string;
    /** Le dimensioni davvero arrivate. */
    pixels?: string;
    /** Ritrovata sul disco invece che scaricata: nessuna richiesta. */
    recovered?: boolean;
  };
  /**
   * Pagine che la biblioteca ha dichiarato di non servire in questo avvio.
   *
   * Senza questo numero «fatte su totali» direbbe «328 su 328» di un libro che
   * sul disco ne ha 326, e la differenza sembrerebbe un difetto nostro.
   */
  unavailable?: number;
  /** Il tetto scelto nelle impostazioni, che vale per tutto il lavoro. */
  cap?: string;
  /** Pagine davvero ridotte dall'ottimizzazione: le altre erano già piccole. */
  shrunk?: number;
  /** Byte liberati finora dall'ottimizzazione. */
  freed?: number;
  provider?: string;
  host?: string;
  level?: string;
  intact?: number;
  missing?: number;
  corrupt?: number;
  orphans?: { count: number; bytes: number };
}

/**
 * Legge i dettagli senza fidarsi della forma: arrivano da un gestore che può
 * essere più nuovo dell'interfaccia, e una chiave inattesa non deve far sparire
 * la riga.
 */
export function parseJobDetail(raw: string | null): JobDetail {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const num = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() ? value : undefined;
    const group = (value: unknown): Record<string, unknown> =>
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

    const units = group(record.units);
    const bytes = group(record.bytes);
    const last = group(record.last);
    const orphans = group(record.orphans);

    return {
      units:
        num(units.done) !== undefined && num(units.total) !== undefined
          ? { done: num(units.done)!, total: num(units.total)!, label: text(units.label) ?? 'generic' }
          : undefined,
      bytes:
        num(bytes.downloaded) !== undefined
          ? { downloaded: num(bytes.downloaded)!, estimated: num(bytes.estimated) ?? 0 }
          : undefined,
      last:
        num(last.index) !== undefined
          ? {
              index: num(last.index)!,
              label: text(last.label),
              bytes: num(last.bytes),
              size: text(last.size),
              pixels: text(last.pixels),
              recovered: typeof last.recovered === 'boolean' ? last.recovered : undefined,
            }
          : undefined,
      unavailable: num(record.unavailable),
      shrunk: num(record.shrunk),
      freed: num(record.freed),
      cap: text(record.cap),
      provider: text(record.provider),
      host: text(record.host),
      level: text(record.level),
      intact: num(record.intact),
      missing: num(record.missing),
      corrupt: num(record.corrupt),
      orphans:
        num(orphans.count) !== undefined
          ? { count: num(orphans.count)!, bytes: num(orphans.bytes) ?? 0 }
          : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Un lavoro è fermo in attesa di poter riprovare: non è fallito, e la barra non
 * deve fingere di avanzare. Con i limiti delle biblioteche l'attesa può
 * durare minuti.
 */
export function isWaitingToRetry(job: Job): boolean {
  return job.status === 'queued' && job.nextAttemptAt !== null;
}

/**
 * Quanti secondi mancano al prossimo tentativo.
 *
 * Si conta dall'orario del prossimo tentativo, non dal numero scritto quando
 * l'attesa è cominciata: quello invecchia mentre la riga resta ferma sullo
 * schermo, e dopo cinque minuti direbbe ancora «riprende fra 10 minuti».
 * Il database scrive gli orari in UTC senza dirlo.
 */
export function retryCountdownSeconds(job: Job, now = Date.now()): number | null {
  if (!isWaitingToRetry(job) || !job.nextAttemptAt) return null;
  const at = Date.parse(job.nextAttemptAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(at)) return job.etaSeconds;
  return Math.max(0, Math.round((at - now) / 1000));
}

/**
 * Il lavoro sta girando ma è fermo per rispettare i limiti della biblioteca
 *: con i profili tarati può restare immobile per minuti. È la stessa
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
