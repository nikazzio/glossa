import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  cancelJob,
  createJob,
  formatEta,
  isTerminal,
  isWaitingToRetry,
  listActiveJobs,
  onJobChanged,
  pauseJob,
  resumeJob,
  retryJob,
  type Job,
} from './jobsService';

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    jobType: 'debug_counter',
    status: 'queued',
    priority: 0,
    progress: 0,
    message: null,
    config: '{}',
    checkpoint: null,
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    errorKind: null,
    etaSeconds: null,
    waitingReason: null,
    dependsOnJobId: null,
    nextAttemptAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('creazione e controllo dei lavori', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('chiede la creazione al backend invece di eseguire qualcosa qui', async () => {
    invokeMock.mockResolvedValueOnce(job());

    await createJob({ jobType: 'debug_counter', config: '{"steps":3}' });

    expect(invokeMock).toHaveBeenCalledWith('create_job', {
      request: { jobType: 'debug_counter', config: '{"steps":3}' },
    });
  });

  it('elenca solo i lavori non ancora finiti', async () => {
    invokeMock.mockResolvedValueOnce([job({ status: 'running' })]);

    const jobs = await listActiveJobs();

    expect(invokeMock).toHaveBeenCalledWith('list_active_jobs');
    expect(jobs).toHaveLength(1);
  });

  it('inoltra pausa, ripresa, annullamento e nuovo tentativo', async () => {
    invokeMock.mockResolvedValue(undefined);

    await pauseJob('j1');
    await resumeJob('j1');
    await cancelJob('j1');
    await retryJob('j1');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'pause_job', { id: 'j1' });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'resume_job', { id: 'j1' });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'cancel_job', { id: 'j1' });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'retry_job', { id: 'j1', fromScratch: false });
  });

  it('ripete da capo solo se lo si chiede', async () => {
    invokeMock.mockResolvedValue(undefined);

    await retryJob('j1', true);

    expect(invokeMock).toHaveBeenCalledWith('retry_job', { id: 'j1', fromScratch: true });
  });
});

describe('ascolto dei cambiamenti', () => {
  beforeEach(() => {
    listenMock.mockReset();
  });

  it('riceve un avviso a ogni cambiamento, senza interrogare a intervalli', async () => {
    const seen: Job[] = [];
    listenMock.mockImplementation(async (_event, handler) => {
      (handler as (payload: { payload: Job }) => void)({ payload: job({ status: 'running' }) });
      return () => {};
    });

    await onJobChanged((changed) => seen.push(changed));

    expect(listenMock).toHaveBeenCalledWith('jobs:updated', expect.any(Function));
    expect(seen[0].status).toBe('running');
  });
});

describe('come si legge lo stato di un lavoro', () => {
  it('fermo in attesa di riprovare non è fallito', () => {
    // Con i limiti delle biblioteche l'attesa dura minuti: dirla "errore"
    // farebbe rinunciare a un lavoro che sta procedendo (D17).
    const waiting = job({ status: 'queued', nextAttemptAt: '2026-08-13 10:00:00' });

    expect(isWaitingToRetry(waiting)).toBe(true);
    expect(isTerminal(waiting)).toBe(false);
  });

  it('un lavoro appena messo in coda non è in attesa di un nuovo tentativo', () => {
    expect(isWaitingToRetry(job())).toBe(false);
  });

  it('finito, annullato e in errore sono stati definitivi', () => {
    expect(isTerminal(job({ status: 'completed' }))).toBe(true);
    expect(isTerminal(job({ status: 'cancelled' }))).toBe(true);
    expect(isTerminal(job({ status: 'error' }))).toBe(true);
    expect(isTerminal(job({ status: 'pausing' }))).toBe(false);
  });
});

describe('tempo stimato', () => {
  it('sotto il minuto si contano i secondi', () => {
    expect(formatEta(42)).toBe('42 s');
  });

  it('un quarto d’ora si legge in minuti', () => {
    expect(formatEta(900)).toBe('15 min');
  });

  it('oltre l’ora si separano ore e minuti', () => {
    expect(formatEta(3600)).toBe('1 h');
    expect(formatEta(5400)).toBe('1 h 30 min');
  });

  it('senza stima non si inventa un numero', () => {
    expect(formatEta(null)).toBeNull();
  });
});

describe('risposte inattese dal backend', () => {
  it('fuori da Tauri l’elenco vuoto non rompe l’interfaccia', async () => {
    // Nel browser il comando non esiste: la risposta non è un elenco, e darla
    // per buona farebbe cadere tutta l'applicazione.
    invokeMock.mockResolvedValueOnce(null as never);

    await expect(listActiveJobs()).resolves.toEqual([]);
  });
});
