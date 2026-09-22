import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { CacheRequest } from './cacheService';

const JOB_EVENT = 'jobs:updated';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'error';

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
  waitingReason: string | null;
  phase: string | null;
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

export async function listActiveJobs(): Promise<Job[]> {
  const answer = await invoke<Job[] | null>('list_active_jobs');
  return Array.isArray(answer) ? answer : [];
}

export interface JobsPage {
  jobs: Job[];
  /** Quanti job soddisfano i filtri, non quanti ne sono arrivati in questa pagina. */
  total: number;
}

/** I filtri della vista completa: valgono per l'elenco e per l'eliminazione in
 *  blocco, così «elimina quello che vedo» elimina davvero quello che si vede. */
export interface JobsFilter {
  statuses?: JobStatus[];
  jobTypes?: string[];
  /** Parole cercate nel messaggio del lavoro. */
  query?: string;
}

export interface JobsQuery extends JobsFilter {
  limit: number;
  offset: number;
}

export async function listJobs(query: JobsQuery): Promise<JobsPage> {
  const answer = await invoke<JobsPage | null>('list_jobs', {
    ...filterArguments(query),
    limit: query.limit,
    offset: query.offset,
  });
  return answer ?? { jobs: [], total: 0 };
}

function filterArguments(filter: JobsFilter) {
  return {
    statuses: filter.statuses?.length ? filter.statuses : null,
    jobTypes: filter.jobTypes?.length ? filter.jobTypes : null,
    query: filter.query?.trim() ? filter.query.trim() : null,
  };
}

export async function getJob(id: string): Promise<Job | null> {
  return invoke<Job | null>('get_job', { id });
}

export async function pauseJob(id: string): Promise<void> {
  await invoke('pause_job', { id });
}

export async function resumeJob(id: string): Promise<void> {
  await invoke('resume_job', { id });
}

export async function cancelJob(id: string): Promise<void> {
  await invoke('cancel_job', { id });
}

export async function enqueueSourceDownload(request: {
  providerKey: string;
  manifestUrl: string;
  /** Se manca, la digitalizzazione si ritrova dall'indirizzo del manifesto. */
  versionId?: string;
  sizeTag?: string;
}): Promise<Job> {
  return invoke<Job>('enqueue_source_download', {
    ...request,
    workspaceId: useWorkspaceStore.getState().activeWorkspace?.id ?? null,
  });
}

/** Scarica il documento unico offerto dalla biblioteca: un file, non una
 *  sequenza di pagine, quindi nessuna misura da scegliere. */
export async function enqueuePdfDownload(request: {
  providerKey: string;
  sourceUrl: string;
  versionId: string;
}): Promise<Job> {
  return invoke<Job>('enqueue_pdf_download', {
    ...request,
    workspaceId: useWorkspaceStore.getState().activeWorkspace?.id ?? null,
  });
}

export async function enqueueVaultVerification(full = false): Promise<Job> {
  return invoke<Job>('enqueue_vault_verification', { full });
}

export const OCR_JOB_TYPE = 'ocr_page';

/** Una pagina da leggere, già risolta (#220): stessa forma di
 *  `OcrPageConfig` lato Rust (`src-tauri/src/ocr/handler.rs`). */
export interface OcrPageJobInput {
  segmentId: string;
  documentId: string;
  cacheRequest: CacheRequest;
  prompt: string;
  provider: string;
  model: string;
  imageEdge: number;
  /** Copie della pagina già sul computer da inviare così come sono, in ordine
   *  di preferenza; vuoto = immagine ottimizzata. Nessuna ha un indirizzo
   *  remoto: se mancano tutte, il lavoro ripiega sull'ottimizzata. */
  localRequests: CacheRequest[];
  pageLabel: string;
}

export async function enqueueOcrPages(pages: OcrPageJobInput[]): Promise<Job> {
  return createJob({
    jobType: OCR_JOB_TYPE,
    config: JSON.stringify({ pages }),
    workspaceId: useWorkspaceStore.getState().activeWorkspace?.id ?? undefined,
  });
}

/** Una pagina dentro un lavoro OCR, come la dichiara la configurazione. */
export interface OcrJobPage {
  segmentId: string;
  documentId: string;
  pageLabel: string;
}

/** Le pagine **ancora da leggere** di un lavoro OCR (#220), lette dalla sua
 *  stessa configurazione e dal suo segnalibro di ripresa. Nessuna mappa tenuta
 *  in memoria: così il segnale «questa pagina si sta leggendo» sopravvive a un
 *  riavvio del programma, esattamente come il lavoro. */
export function ocrPendingPagesOf(job: Job): OcrJobPage[] {
  if (job.jobType !== OCR_JOB_TYPE) return [];
  try {
    const parsed = JSON.parse(job.config) as { pages?: unknown };
    if (!Array.isArray(parsed.pages)) return [];
    const done = new Set(parseCheckpointSegmentIds(job.checkpoint));
    return parsed.pages
      .map((page) => page as Partial<OcrJobPage>)
      .filter(
        (page): page is OcrJobPage =>
          typeof page.segmentId === 'string' &&
          typeof page.documentId === 'string' &&
          typeof page.pageLabel === 'string',
      )
      .filter((page) => !done.has(page.segmentId));
  } catch {
    // Configurazione illeggibile: il lavoro resta visibile nel pannello
    // lavori, semplicemente non accende nessuna pagina.
    return [];
  }
}

function parseCheckpointSegmentIds(checkpoint: string | null): string[] {
  if (!checkpoint) return [];
  try {
    const parsed = JSON.parse(checkpoint) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function clearFinishedJobs(id?: string): Promise<number> {
  return invoke<number>('clear_finished_jobs', { id });
}

/** Elimina i lavori conclusi che soddisfano i filtri, e restituisce quanti. */
export async function clearMatchingJobs(filter: JobsFilter): Promise<number> {
  return invoke<number>('clear_matching_jobs', filterArguments(filter));
}

export async function retryJob(id: string, fromScratch = false): Promise<void> {
  await invoke('retry_job', { id, fromScratch });
}

export async function onJobChanged(handler: (job: Job) => void): Promise<() => void> {
  return listen<Job>(JOB_EVENT, (event) => handler(event.payload));
}

export interface JobDetail {
  units?: { done: number; total: number; label: string };
  bytes?: { downloaded: number; estimated: number };
  /** Byte al secondo osservati adesso: dice se sta scaricando o è fermo. */
  speed?: number;
  last?: {
    index: number;
    label?: string;
    bytes?: number;
    size?: string;
    pixels?: string;
    recovered?: boolean;
  };
  unavailable?: number;
  cap?: string;
  shrunk?: number;
  skipped?: number;
  freed?: number;
  provider?: string;
  host?: string;
  level?: string;
  intact?: number;
  missing?: number;
  corrupt?: number;
  orphans?: { count: number; bytes: number };
}

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
      speed: num(record.speed),
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
      skipped: num(record.skipped),
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

export function isWaitingToRetry(job: Job): boolean {
  return job.status === 'queued' && job.nextAttemptAt !== null;
}

export function retryCountdownSeconds(job: Job, now = Date.now()): number | null {
  if (!isWaitingToRetry(job) || !job.nextAttemptAt) return null;
  const at = Date.parse(job.nextAttemptAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(at)) return job.etaSeconds;
  return Math.max(0, Math.round((at - now) / 1000));
}

export function isWaitingForLibrary(job: Job): boolean {
  return job.waitingReason === 'libraryLimits';
}

export function isTerminal(job: Job): boolean {
  return job.status === 'completed' || job.status === 'cancelled' || job.status === 'error';
}

export function formatEta(etaSeconds: number | null): string | null {
  if (etaSeconds === null || etaSeconds < 0) return null;
  if (etaSeconds < 60) return `${Math.round(etaSeconds)} s`;
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
