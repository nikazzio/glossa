import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobsPanel } from './JobsPanel';
import { useJobsStore } from '../../stores/jobsStore';
import type { Job } from '../../services/jobsService';

vi.mock('../../services/jobsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/jobsService')>();
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
    progress: 0.34,
    message: 'Beatus, 34/210',
    config: '{}',
    checkpoint: null,
    attemptCount: 1,
    maxAttempts: 3,
    error: null,
    errorKind: null,
    etaSeconds: 720,
    waitingReason: null,
    dependsOnJobId: null,
    nextAttemptAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function renderPanel(jobs: Job[]) {
  useJobsStore.setState({ jobs, isLoaded: true });
  return render(<JobsPanel panelId="p" labelledBy="l" />);
}

describe('pannello dei lavori', () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: [], isLoaded: false });
  });

  it('senza lavori spiega cosa comparirà lì', () => {
    renderPanel([]);

    expect(screen.getByText('jobs.emptyTitle')).toBeInTheDocument();
  });

  it('mostra il lavoro in corso con la sua descrizione', () => {
    renderPanel([job()]);

    expect(screen.getByText('Beatus, 34/210')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '34');
  });

  it('di un lavoro in corso offre pausa e annullamento, non ripresa', () => {
    renderPanel([job()]);

    expect(screen.getByRole('button', { name: 'jobs.pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'jobs.cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.resume' })).not.toBeInTheDocument();
  });

  it('di un lavoro fallito offre solo un nuovo tentativo', () => {
    renderPanel([job({ status: 'error', error: 'connessione caduta' })]);

    expect(screen.getByRole('button', { name: 'jobs.retry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.pause' })).not.toBeInTheDocument();
    expect(screen.getByText('connessione caduta')).toBeInTheDocument();
  });

  it('un lavoro fermo in attesa di riprovare non è mostrato come errore', () => {
    // Stessa immobilità, significato opposto (D17).
    renderPanel([job({ status: 'queued', nextAttemptAt: '2026-08-13 10:00:00', etaSeconds: 480 })]);

    expect(screen.getByText('jobs.waitingResumesIn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'jobs.resume' })).toBeInTheDocument();
  });

  it('la barra di un lavoro fermo non è animata', () => {
    renderPanel([job({ status: 'paused', progress: 0.5 })]);

    expect(screen.getByRole('progressbar').className).not.toContain('transition');
  });

  it('chiedendo la pausa la inoltra all’orchestratore', async () => {
    const user = userEvent.setup();
    const pause = vi.fn(async () => {});
    renderPanel([job()]);
    useJobsStore.setState({ pause });

    await user.click(screen.getByRole('button', { name: 'jobs.pause' }));

    expect(pause).toHaveBeenCalledWith('j1');
  });

  it('un lavoro annullato non offre più comandi', () => {
    renderPanel([job({ status: 'cancelled', updatedAt: null })]);

    expect(screen.queryByRole('button', { name: 'jobs.cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.pause' })).not.toBeInTheDocument();
  });
});

describe('attesa per i limiti della biblioteca', () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: [], isLoaded: false });
  });

  it('un lavoro fermo per i limiti non è un errore e non anima la barra', () => {
    // Con i profili tarati può restare immobile per minuti (D18): dirlo
    // «errore» farebbe rinunciare a uno scaricamento che sta procedendo.
    renderPanel([job({ status: 'running', waitingReason: 'libraryLimits', progress: 0.4 })]);

    expect(screen.getByText('jobs.waitingForLibrary')).toBeInTheDocument();
    expect(screen.getByRole('progressbar').className).not.toContain('transition');
  });
});
