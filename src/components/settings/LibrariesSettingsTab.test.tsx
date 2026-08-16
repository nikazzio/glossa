import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibrariesSettingsTab } from './LibrariesSettingsTab';
import {
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

const vatican: LibrarySettings = {
  key: 'vatican',
  label: 'Vatican Library',
  inRegistry: true,
  customised: true,
  sizeCap: '3000',
  profile: cautious,
};

const list = vi.mocked(listLibrarySettings);
const save = vi.mocked(saveLibrarySettings);
const reset = vi.mocked(resetLibrarySettings);

describe('impostazioni delle biblioteche', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([gallica, vatican]);
    save.mockReset().mockResolvedValue([{ ...gallica, customised: true }, vatican]);
    reset.mockReset().mockResolvedValue([gallica, vatican]);
  });

  it('una biblioteca per pulsante, con il nome solo al passaggio del mouse', async () => {
    render(<LibrariesSettingsTab />);

    expect(await screen.findByRole('tab', { name: 'Gallica' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vatican Library' })).toBeInTheDocument();
  });

  it('apre la prima biblioteca senza doverla scegliere', async () => {
    render(<LibrariesSettingsTab />);

    expect(await screen.findByLabelText('settings.libraries.field.maxAttempts')).toHaveValue(3);
  });

  it('i valori si vedono ma non si toccano finché non lo si chiede', async () => {
    render(<LibrariesSettingsTab />);

    expect(await screen.findByLabelText('settings.libraries.field.maxAttempts')).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'settings.libraries.editValues' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('acceso l interruttore, i valori si cambiano e si salvano', async () => {
    const user = userEvent.setup();
    render(<LibrariesSettingsTab />);
    await user.click(await screen.findByRole('switch', { name: 'settings.libraries.editValues' }));

    const attempts = screen.getByLabelText('settings.libraries.field.maxAttempts');
    await user.clear(attempts);
    await user.type(attempts, '4');
    await user.click(screen.getByRole('button', { name: 'settings.libraries.save' }));

    expect(save).toHaveBeenCalledWith('gallica', null, expect.objectContaining({ maxAttempts: 4 }));
  });

  it('spegnere l interruttore riporta la biblioteca ai valori dell applicazione', async () => {
    const user = userEvent.setup();
    render(<LibrariesSettingsTab />);
    await user.click(await screen.findByRole('tab', { name: 'Vatican Library' }));

    await user.click(screen.getByRole('switch', { name: 'settings.libraries.editValues' }));

    expect(reset).toHaveBeenCalledWith('vatican');
  });

  it('una biblioteca mai toccata non ha niente da ripristinare', async () => {
    render(<LibrariesSettingsTab />);

    await screen.findByRole('tab', { name: 'Gallica' });
    expect(screen.queryByRole('button', { name: 'settings.libraries.reset' })).not.toBeInTheDocument();
  });

});
