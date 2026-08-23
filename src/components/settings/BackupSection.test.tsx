import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupSection } from './BackupSection';
import { writeBackup } from '../../services/backupService';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../../services/backupService', () => ({ writeBackup: vi.fn(), restoreBackup: vi.fn() }));
vi.mock('../../services/jobsService', () => ({ enqueueVaultVerification: vi.fn() }));
vi.mock('../../services/restoreFollowUp', () => ({ markRestoreCheck: vi.fn() }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn() } }));

describe('BackupSection', () => {
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
});
