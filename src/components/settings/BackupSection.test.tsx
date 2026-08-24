import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupSection } from './BackupSection';
import { restoreBackup, writeBackup } from '../../services/backupService';
import { toast } from 'sonner';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../../services/backupService', () => ({ writeBackup: vi.fn(), restoreBackup: vi.fn() }));
vi.mock('../../services/jobsService', () => ({ enqueueVaultVerification: vi.fn() }));
vi.mock('../../services/restoreFollowUp', () => ({ markRestoreCheck: vi.fn() }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn() } }));

describe('BackupSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('spiega perché il salvataggio cifrato è disabilitato e lo abilita solo con due password valide uguali', async () => {
    const user = userEvent.setup();
    render(<BackupSection />);

    await user.click(screen.getByRole('button', { name: 'settings.backupEncryptedExportTooltip' }));
    const save = screen.getByRole('button', { name: 'settings.backupSaveEncrypted' });
    const password = screen.getByLabelText('settings.backupPasswordPlaceholder');
    const confirmation = screen.getByLabelText('settings.backupPasswordConfirmationPlaceholder');

    expect(password).toHaveAttribute('lang', navigator.language);
    expect(confirmation).toHaveAttribute('lang', navigator.language);
    expect(save).toBeDisabled();
    await user.type(password, 'corta');
    expect(screen.getByText('settings.backupPasswordTooShort')).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(password);
    await user.type(password, 'una password molto lunga');
    await user.type(confirmation, 'una password diversa');
    expect(screen.getByText('settings.backupPasswordMismatch')).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(confirmation);
    await user.type(confirmation, 'una password molto lunga');
    expect(save).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'common.cancel' }));
    await user.click(screen.getByRole('button', { name: 'settings.backupEncryptedImportTooltip' }));
    expect(screen.getByLabelText('settings.backupSecretPlaceholder')).toHaveAttribute('lang', navigator.language);
  });

  it('chiede due volte la password prima di creare un backup cifrato', async () => {
    vi.mocked(writeBackup).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<BackupSection />);

    await user.click(screen.getByRole('button', { name: 'settings.backupEncryptedExportTooltip' }));
    expect(screen.getByLabelText('settings.backupPasswordPlaceholder')).toBeInTheDocument();
    expect(screen.getByLabelText('settings.backupPasswordConfirmationPlaceholder')).toBeInTheDocument();

    await user.type(screen.getByLabelText('settings.backupPasswordPlaceholder'), 'una password molto lunga');
    await user.type(screen.getByLabelText('settings.backupPasswordConfirmationPlaceholder'), 'una password molto lunga');
    await user.click(screen.getByRole('button', { name: 'settings.backupSaveEncrypted' }));

    expect(writeBackup).toHaveBeenCalledWith(expect.objectContaining({
      privacy: 'password',
      password: 'una password molto lunga',
      recoveryCode: expect.any(String),
    }));
    expect(await screen.findByText('settings.backupShowRecoveryCode')).toBeInTheDocument();
  });

  it('spiega quando il formato del backup non è più supportato', async () => {
    vi.mocked(restoreBackup).mockRejectedValue(new Error('backup_format_unsupported'));
    const user = userEvent.setup();
    render(<BackupSection />);

    await user.click(screen.getByRole('button', { name: 'settings.backupImportTooltip' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('files.backupUnsupported', undefined);
    });
  });

  it('rende il codice selezionabile e offre il comando dedicato per copiarlo', async () => {
    vi.mocked(writeBackup).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<BackupSection />);

    await user.click(screen.getByRole('button', { name: 'settings.backupEncryptedExportTooltip' }));
    await user.type(screen.getByLabelText('settings.backupPasswordPlaceholder'), 'una password molto lunga');
    await user.type(screen.getByLabelText('settings.backupPasswordConfirmationPlaceholder'), 'una password molto lunga');
    await user.click(screen.getByRole('button', { name: 'settings.backupSaveEncrypted' }));
    const code = await screen.findByRole('textbox', { name: 'settings.backupShowRecoveryCode' });
    fireEvent.focus(code);

    expect((code as HTMLInputElement).value).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/);
    expect(code).toHaveFocus();
    expect((code as HTMLInputElement).selectionStart).toBe(0);
    expect((code as HTMLInputElement).selectionEnd).toBe((code as HTMLInputElement).value.length);
    expect(screen.getByRole('button', { name: 'settings.backupCopyRecoveryCode' })).toBeEnabled();
  });
});
