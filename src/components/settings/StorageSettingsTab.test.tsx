import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { StorageSettingsTab } from './StorageSettingsTab';
import * as storageConfigService from '../../services/storageConfigService';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/storageConfigService');

const mocked = vi.mocked(storageConfigService);

describe('StorageSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getDataDir.mockResolvedValue({ path: '/home/user/.config/glossa', isOverride: false });
  });

  it('shows the resolved default location', async () => {
    render(<StorageSettingsTab />);

    expect(await screen.findByText('/home/user/.config/glossa')).toBeInTheDocument();
    expect(screen.getByText('settings.storage.defaultLocation')).toBeInTheDocument();
  });

  it('shows the custom-location label when overridden', async () => {
    mocked.getDataDir.mockResolvedValue({ path: '/mnt/data/glossa', isOverride: true });

    render(<StorageSettingsTab />);

    expect(await screen.findByText('/mnt/data/glossa')).toBeInTheDocument();
    expect(screen.getByText('settings.storage.customLocation')).toBeInTheDocument();
  });

  it('does nothing when the user cancels the folder picker', async () => {
    mocked.pickDataDirFolder.mockResolvedValue(null);
    render(<StorageSettingsTab />);
    await screen.findByText('/home/user/.config/glossa');

    await userEvent.click(screen.getByText('settings.storage.changeFolder'));

    expect(mocked.setDataDir).not.toHaveBeenCalled();
  });

  it('migrates to the picked folder and shows a success toast', async () => {
    mocked.pickDataDirFolder.mockResolvedValue('/mnt/data/glossa');
    mocked.setDataDir.mockResolvedValue(undefined);
    render(<StorageSettingsTab />);
    await screen.findByText('/home/user/.config/glossa');

    await userEvent.click(screen.getByText('settings.storage.changeFolder'));

    await waitFor(() => expect(mocked.setDataDir).toHaveBeenCalledWith('/mnt/data/glossa'));
    expect(toast.success).toHaveBeenCalledWith('settings.storage.migrationSucceeded');
  });

  it('shows an error toast when migration fails', async () => {
    mocked.pickDataDirFolder.mockResolvedValue('/mnt/data/glossa');
    mocked.setDataDir.mockRejectedValue(new Error('Destination folder is not writable'));
    render(<StorageSettingsTab />);
    await screen.findByText('/home/user/.config/glossa');

    await userEvent.click(screen.getByText('settings.storage.changeFolder'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'settings.storage.migrationFailed',
      { description: 'Destination folder is not writable' },
    ));
  });
});
