import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Job } from '../services/jobsService';
import { isFinishedRecently, isRunning, isWaiting, summarizeJobs, useJobsStore } from './jobsStore';

vi.mock('../services/jobsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/jobsService')>();
  return {
    ...actual,
    listActiveJobs: vi.fn(async () => []),
    onJobChanged: vi.fn(async () => () => {}),
    pauseJob: vi.fn(async () => {}),
    resumeJob: vi.fn(async () => {}),
    cancelJob: vi.fn(async () => {}),
    retryJob: vi.fn(async () => {}),
  };
});

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    jobType: 'debug_counter',
    status: 'running',
    priority: 0,
    progress: 0.2,
    message: 'Beatus, 34/210',
    config: '{}',
    checkpoint: null,
    attemptCount: 1,
    maxAttempts: 3,
    error: null,
    errorKind: null,
    etaSeconds: 600,
    waitingReason: null,
    phase: null,
    detail: null,
    dependsOnJobId: null,
    nextAttemptAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('elenco dei lavori', () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: [], isLoaded: false });
  });

  it('un cambiamento su un lavoro noto lo sostituisce, non lo duplica', () => {
    useJobsStore.getState().applyChange(job());
    useJobsStore.getState().applyChange(job({ progress: 0.9 }));

    const { jobs } = useJobsStore.getState();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].progress).toBe(0.9);
  });

  it('un lavoro mai visto viene aggiunto', () => {
    useJobsStore.getState().applyChange(job());
    useJobsStore.getState().applyChange(job({ id: 'j2' }));

    expect(useJobsStore.getState().jobs).toHaveLength(2);
  });
});

describe('come si raggruppano i lavori', () => {
  it('in corso comprende anche chi si sta fermando', () => {
    expect(isRunning(job({ status: 'running' }))).toBe(true);
    expect(isRunning(job({ status: 'pausing' }))).toBe(true);
    expect(isRunning(job({ status: 'cancelling' }))).toBe(true);
    expect(isRunning(job({ status: 'paused' }))).toBe(false);
  });

  it('in attesa comprende la pausa, la coda e l’attesa di un nuovo tentativo', () => {
    expect(isWaiting(job({ status: 'paused' }))).toBe(true);
    expect(isWaiting(job({ status: 'queued' }))).toBe(true);
    expect(isWaiting(job({ status: 'queued', nextAttemptAt: '2026-08-13 10:00:00' }))).toBe(true);
    expect(isWaiting(job({ status: 'running' }))).toBe(false);
  });

  it('i lavori finiti restano visibili per la giornata, poi no', () => {
    const now = Date.parse('2026-08-13T12:00:00Z');
    const recent = job({ status: 'completed', updatedAt: '2026-08-13 09:00:00' });
    const old = job({ status: 'completed', updatedAt: '2026-08-11 09:00:00' });

    expect(isFinishedRecently(recent, now)).toBe(true);
    expect(isFinishedRecently(old, now)).toBe(false);
  });
});

describe('riassunto per la barra di stato', () => {
  it('conta solo i lavori non finiti', () => {
    const summary = summarizeJobs([job(), job({ id: 'j2', status: 'completed' })]);

    expect(summary.activeCount).toBe(1);
  });

  it('mostra il lavoro in esecuzione, non uno qualsiasi', () => {
    const summary = summarizeJobs([
      job({ id: 'fermo', status: 'paused' }),
      job({ id: 'attivo', status: 'running' }),
    ]);

    expect(summary.current?.id).toBe('attivo');
  });

  it('senza nessuno in esecuzione dichiara che è tutto fermo', () => {
    // Con i limiti delle biblioteche è frequente: l’indicatore non deve girare.
    const summary = summarizeJobs([job({ status: 'queued', nextAttemptAt: '2026-08-13 10:00:00' })]);

    expect(summary.allWaiting).toBe(true);
  });

  it('somma le stime quando le hanno tutti', () => {
    const complete = summarizeJobs([job({ etaSeconds: 60 }), job({ id: 'j2', etaSeconds: 120 })]);

    expect(complete.etaSeconds).toBe(180);
  });

  it('se qualcuno non sa dire quanto manca, mostra la stima del lavoro in corso', () => {
    // Sommare stime parziali darebbe un totale più basso del vero; non dire
    // niente farebbe sembrare la coda bloccata.
    const partial = summarizeJobs([
      job({ id: 'in-corso', status: 'running', etaSeconds: 60 }),
      job({ id: 'in-coda', status: 'queued', etaSeconds: null }),
    ]);

    expect(partial.etaSeconds).toBe(60);
  });

  it('senza nessuna stima non inventa un numero', () => {
    const nothing = summarizeJobs([job({ status: 'queued', etaSeconds: null })]);

    expect(nothing.etaSeconds).toBeNull();
  });

  it('i lavori non riusciti si contano a parte', () => {
    const summary = summarizeJobs([job({ status: 'error' })]);

    expect(summary.failedCount).toBe(1);
    expect(summary.activeCount).toBe(0);
  });
});
