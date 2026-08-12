import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobsSettingsTab } from './JobsSettingsTab';
import {
  getAutoResumeDownloads,
  getJobLimits,
  setAutoResumeDownloads,
  setJobLimit,
} from '../../services/jobSettingsService';

vi.mock('../../services/jobSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/jobSettingsService')>();
  return {
    ...actual,
    getJobLimits: vi.fn(),
    setJobLimit: vi.fn(),
    getAutoResumeDownloads: vi.fn(),
    setAutoResumeDownloads: vi.fn(),
  };
});

const limits = vi.mocked(getJobLimits);
const saveLimit = vi.mocked(setJobLimit);
const autoResume = vi.mocked(getAutoResumeDownloads);
const saveAutoResume = vi.mocked(setAutoResumeDownloads);

describe('impostazioni dei lavori', () => {
  beforeEach(() => {
    limits.mockReset();
    saveLimit.mockReset();
    autoResume.mockReset();
    saveAutoResume.mockReset();
    limits.mockResolvedValue({ network: 2, cpu: 0, disk: 1, languageService: 1, documents: 1 });
    autoResume.mockResolvedValue(false);
    saveLimit.mockImplementation(async (_resource, value) => value);
    saveAutoResume.mockResolvedValue(undefined);
  });

  it('mostra un limite per ciascuna delle cinque risorse', async () => {
    render(<JobsSettingsTab />);

    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(5));
  });

  it('il limite non impostato si legge come automatico, non come zero', async () => {
    render(<JobsSettingsTab />);

    const processing = await screen.findByLabelText('settings.jobs.resource.cpu');
    expect(processing).toHaveValue('0');
    expect(screen.getAllByText('settings.jobs.automatic').length).toBeGreaterThan(0);
  });

  it('cambiando un limite lo salva', async () => {
    const user = userEvent.setup();
    render(<JobsSettingsTab />);
    const disk = await screen.findByLabelText('settings.jobs.resource.disk');

    await user.selectOptions(disk, '2');

    expect(saveLimit).toHaveBeenCalledWith('disk', 2);
  });

  it('avvisa che il limite verso le biblioteche non è una questione di potenza', async () => {
    render(<JobsSettingsTab />);

    expect(await screen.findByText('settings.jobs.networkWarning')).toBeInTheDocument();
  });

  it('la ripresa automatica parte spenta e si può accendere', async () => {
    const user = userEvent.setup();
    render(<JobsSettingsTab />);
    const toggle = await screen.findByRole('switch', { name: 'settings.jobs.autoResume' });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);

    expect(saveAutoResume).toHaveBeenCalledWith(true);
  });
});
