import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    phase: null,
    detail: null,
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

  it('mentre gira dice cosa sta facendo, non un generico «in corso»', () => {
    renderPanel([job({ status: 'running', phase: 'manifest', progress: 0.01 })]);

    expect(screen.getByText(/jobs\.phase\.manifest/)).toBeInTheDocument();
  });

  it('una fase che l\u2019interfaccia non conosce si legge com\u2019\u00e8 scritta', () => {
    // Ogni tipo di lavoro ha il suo vocabolario: quelli futuri non devono
    // sparire dalla riga solo perché la traduzione non c'è ancora.
    renderPanel([job({ status: 'running', phase: 'ocr_pass_2', progress: 0.5 })]);

    expect(screen.getByText(/ocr_pass_2/)).toBeInTheDocument();
  });


  it('la riga dice di che tipo di lavoro si tratta', () => {
    // Scaricare un libro e verificare il deposito sono due cose diverse, e
    // finché la riga diceva solo il nome dell'opera non si distinguevano.
    renderPanel([job({ status: 'running', jobType: 'vault_verification', message: 'Beatus' })]);

    expect(screen.getByText('jobs.short.vault_verification')).toBeInTheDocument();
  });

  it('divide quello che vale per l opera da quello che vale per l ultima pagina', () => {
    // Il peso di una pagina letto come se fosse quello del libro era la
    // confusione da togliere.
    renderPanel([
      job({
        status: 'running',
        detail: JSON.stringify({
          size: '1299,',
          available: ['649×963', '1299×1925'],
          last: { index: 34, bytes: 1_420_000 },
        }),
      }),
    ]);
    fireEvent.click(screen.getByText('Beatus, 34/210'));

    expect(screen.getByText('jobs.detail.groupWork')).toBeInTheDocument();
    expect(screen.getByText('jobs.detail.groupLast')).toBeInTheDocument();
    expect(screen.getByText('649×963 · 1299×1925')).toBeInTheDocument();
  });

  it('mostra quanto è arrivato e quanto si prevede in tutto', () => {
    // Il peso della sola carta in corso non dice niente su quanto manca.
    renderPanel([
      job({
        status: 'running',
        progress: 0.1,
        detail: JSON.stringify({
          units: { done: 34, total: 352, label: 'pages' },
          bytes: { downloaded: 48_234_496, estimated: 499_122_176 },
        }),
      }),
    ]);

    expect(screen.getByText('34/352')).toBeInTheDocument();
    expect(screen.getByText(/46 MB \/ ~476 MB/)).toBeInTheDocument();
  });

  it('la riga si apre e mostra i dettagli veri', async () => {
    const user = userEvent.setup();
    renderPanel([
      job({
        status: 'running',
        progress: 0.1,
        detail: JSON.stringify({
          units: { done: 2, total: 352, label: 'pages' },
          bytes: { downloaded: 1_000_000, estimated: 176_000_000 },
          size: '1299,',
          provider: 'archive_org',
          host: 'iiif.archive.org',
        }),
      }),
    ]);

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('1299,')).toBeInTheDocument();
    expect(screen.getByText('iiif.archive.org')).toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  });

  it('un dettaglio malformato non fa sparire la riga', () => {
    renderPanel([job({ status: 'running', message: 'Beatus', detail: 'non è json' })]);

    expect(screen.getByText('Beatus')).toBeInTheDocument();
  });
});
