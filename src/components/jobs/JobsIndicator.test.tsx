import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobsIndicator } from './JobsIndicator';
import { useJobsStore } from '../../stores/jobsStore';
import { useUiStore } from '../../stores/uiStore';
import type { Job } from '../../services/jobsService';

vi.mock('../../services/jobsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/jobsService')>();
  return { ...actual, listActiveJobs: vi.fn(async () => []), onJobChanged: vi.fn(async () => () => {}) };
});

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    jobType: 'debug_counter',
    status: 'running',
    priority: 0,
    progress: 0.3,
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

describe('indicatore dei lavori in barra di stato', () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: [] });
    useUiStore.setState({ showConsoleDrawer: false, drawerTab: 'console' });
  });

  it('senza lavori non occupa spazio', () => {
    const { container } = render(<JobsIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it('in barra mostra quanti sono e quanto manca, il resto sta nel tooltip', () => {
    // Il nome della fonte è lungo quanto vuole: in barra sposterebbe tutto.
    useJobsStore.setState({ jobs: [job()] });

    render(<JobsIndicator />);

    expect(screen.getByText('jobs.activeCount · jobs.etaShort')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'jobs.openPanel' })).toBeInTheDocument();
  });

  it('con tutto fermo dice che è in attesa invece del progresso', () => {
    useJobsStore.setState({
      jobs: [job({ status: 'queued', nextAttemptAt: '2026-08-13 10:00:00', etaSeconds: 480 })],
    });

    render(<JobsIndicator />);

    expect(screen.getByText(/jobs.retryingIn/)).toBeInTheDocument();
  });

  it('apre il pannello sulla scheda dei lavori', async () => {
    const user = userEvent.setup();
    useJobsStore.setState({ jobs: [job()] });

    render(<JobsIndicator />);
    await user.click(screen.getByRole('button', { name: 'jobs.openPanel' }));

    expect(useUiStore.getState().showConsoleDrawer).toBe(true);
    expect(useUiStore.getState().drawerTab).toBe('jobs');
  });

  it('con soli lavori falliti lo segnala e non conta lavori attivi', () => {
    useJobsStore.setState({ jobs: [job({ status: 'error' })] });

    render(<JobsIndicator />);

    expect(screen.getByText('jobs.failedCount')).toBeInTheDocument();
  });
});
