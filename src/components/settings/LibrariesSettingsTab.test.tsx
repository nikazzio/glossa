import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibrariesSettingsTab } from './LibrariesSettingsTab';
import {
  cautiousNetworkProfile,
  listLibrarySettings,
  resetLibrarySettings,
  saveLibrarySettings,
  type LibrarySettings,
  type NetworkProfile,
} from '../../services/downloadSettingsService';

vi.mock('../../services/downloadSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/downloadSettingsService')>();
  return {
    ...actual,
    listLibrarySettings: vi.fn(),
    saveLibrarySettings: vi.fn(),
    resetLibrarySettings: vi.fn(),
    cautiousNetworkProfile: vi.fn(),
  };
});

const cautious: NetworkProfile = {
  pauseMinMs: 600,
  pauseMaxMs: 1_600,
  burstRequests: 100,
  burstWindowSecs: 60,
  cooldown403Secs: 120,
  cooldown429Secs: 120,
  hostConcurrency: 4,
  maxAttempts: 5,
  backoffBaseSecs: 15,
  backoffCapSecs: 300,
  connectTimeoutSecs: 15,
  readTimeoutSecs: 30,
  needsViewerWarmup: false,
};

const gallica: LibrarySettings = {
  key: 'gallica',
  label: 'Gallica',
  inRegistry: true,
  customised: false,
  sizeCap: null,
  profile: { ...cautious, pauseMinMs: 2_500, pauseMaxMs: 6_000, maxAttempts: 3 },
};

const list = vi.mocked(listLibrarySettings);
const save = vi.mocked(saveLibrarySettings);
const reset = vi.mocked(resetLibrarySettings);
const defaults = vi.mocked(cautiousNetworkProfile);

describe('impostazioni delle biblioteche', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([gallica]);
    save.mockReset().mockResolvedValue([{ ...gallica, customised: true }]);
    reset.mockReset().mockResolvedValue([gallica]);
    defaults.mockReset().mockResolvedValue(cautious);
  });

  it('elenca le biblioteche del registro', async () => {
    render(<LibrariesSettingsTab />);

    expect(await screen.findByText('Gallica')).toBeInTheDocument();
  });

  it('i valori si vedono solo quando si apre la biblioteca', async () => {
    const user = userEvent.setup();
    render(<LibrariesSettingsTab />);
    expect(screen.queryByLabelText('settings.libraries.field.maxAttempts')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'settings.libraries.expand' }));

    expect(screen.getByLabelText('settings.libraries.field.maxAttempts')).toHaveValue(3);
  });

  it('una biblioteca mai toccata non ha niente da ripristinare', async () => {
    const user = userEvent.setup();
    render(<LibrariesSettingsTab />);

    await user.click(await screen.findByRole('button', { name: 'settings.libraries.expand' }));

    expect(screen.getByRole('button', { name: 'settings.libraries.reset' })).toBeDisabled();
  });

  it('salva i valori cambiati per quella biblioteca', async () => {
    const user = userEvent.setup();
    render(<LibrariesSettingsTab />);
    await user.click(await screen.findByRole('button', { name: 'settings.libraries.expand' }));
    const attempts = screen.getByLabelText('settings.libraries.field.maxAttempts');

    await user.clear(attempts);
    await user.type(attempts, '4');
    await user.click(screen.getByRole('button', { name: 'settings.libraries.save' }));

    expect(save).toHaveBeenCalledWith(
      'gallica',
      null,
      expect.objectContaining({ maxAttempts: 4 }),
    );
  });

  it('un indirizzo fuori dal registro parte dal profilo prudente', async () => {
    const user = userEvent.setup();
    render(<LibrariesSettingsTab />);
    const host = await screen.findByLabelText('settings.libraries.hostField');

    await user.type(host, 'biblioteca.esempio.org');
    await user.click(screen.getByRole('button', { name: 'settings.libraries.addHost' }));

    expect(save).toHaveBeenCalledWith('biblioteca.esempio.org', null, cautious);
  });
});
