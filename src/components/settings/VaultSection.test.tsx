import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VaultSection } from './VaultSection';
import { chooseVaultFolder, getVaultStatus, adoptDefaultVaultFolder } from '../../services/vaultService';

vi.mock('../../services/vaultService', () => ({
  getVaultStatus: vi.fn(),
  chooseVaultFolder: vi.fn(),
  adoptDefaultVaultFolder: vi.fn(),
  getVerifyVaultOnStartup: vi.fn().mockResolvedValue(false),
  setVerifyVaultOnStartup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/jobsService', () => ({
  enqueueVaultVerification: vi.fn().mockResolvedValue({ id: 'verification:quick' }),
}));

const getStatus = vi.mocked(getVaultStatus);
const choose = vi.mocked(chooseVaultFolder);
const useDefault = vi.mocked(adoptDefaultVaultFolder);

describe('cartella del deposito', () => {
  beforeEach(() => {
    getStatus.mockReset();
    choose.mockReset();
    useDefault.mockReset();
    getStatus.mockResolvedValue({ path: '/dati/vault', reachable: true, isDefault: true });
  });

  it('mostra dove sta il deposito', async () => {
    render(<VaultSection />);

    expect(await screen.findByText('/dati/vault')).toBeInTheDocument();
    expect(screen.getByText('settings.storage.vault.defaultLocation')).toBeInTheDocument();
  });

  it('con il deposito predefinito non offre di rimetterlo dov’è già', async () => {
    render(<VaultSection />);
    await screen.findByText('/dati/vault');

    expect(
      screen.queryByRole('button', { name: 'settings.storage.vault.keepTogether' }),
    ).not.toBeInTheDocument();
  });

  it('con una cartella scelta offre di tornare alla predefinita', async () => {
    getStatus.mockResolvedValue({ path: '/disco/glossa', reachable: true, isDefault: false });

    render(<VaultSection />);

    expect(await screen.findByText('settings.storage.vault.keepTogether')).toBeInTheDocument();
  });

  it('una cartella irraggiungibile viene detta tale, senza dire che i file sono spariti', async () => {
    getStatus.mockResolvedValue({ path: '/disco/glossa', reachable: false, isDefault: false });

    render(<VaultSection />);

    expect(await screen.findByText('settings.storage.vault.unreachable')).toBeInTheDocument();
  });

  it('scegliendo una cartella la chiede al backend e ricarica lo stato', async () => {
    const user = userEvent.setup();
    choose.mockResolvedValue({
      path: '/disco/glossa',
      kind: 'empty',
      writable: true,
      adopted: true,
      syncFolder: false,
    });
    render(<VaultSection />);
    await screen.findByText('/dati/vault');

    await user.click(screen.getByRole('button', { name: /settings.storage.vault.chooseFolder/ }));

    await waitFor(() => expect(choose).toHaveBeenCalled());
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('avvisa quando la cartella scelta sembra sincronizzata', async () => {
    const user = userEvent.setup();
    choose.mockResolvedValue({
      path: '/home/n/OneDrive/glossa',
      kind: 'empty',
      writable: true,
      adopted: true,
      syncFolder: true,
    });
    render(<VaultSection />);
    await screen.findByText('/dati/vault');

    await user.click(screen.getByRole('button', { name: /settings.storage.vault.chooseFolder/ }));

    expect(await screen.findByText('settings.storage.vault.syncWarning')).toBeInTheDocument();
  });

  it('una cartella piena di altro non viene adottata', async () => {
    const user = userEvent.setup();
    choose.mockResolvedValue({
      path: '/home/n/Documenti',
      kind: 'foreign',
      writable: true,
      adopted: false,
      syncFolder: false,
    });
    render(<VaultSection />);
    await screen.findByText('/dati/vault');

    await user.click(screen.getByRole('button', { name: /settings.storage.vault.chooseFolder/ }));

    await waitFor(() => expect(choose).toHaveBeenCalled());
    // Nessuna ricarica: lo stato non è cambiato.
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('“tieni tutto insieme” riporta il deposito nella cartella dati', async () => {
    const user = userEvent.setup();
    getStatus.mockResolvedValue({ path: '/disco/glossa', reachable: true, isDefault: false });
    useDefault.mockResolvedValue({ path: '/dati/vault', reachable: true, isDefault: true });
    render(<VaultSection />);
    await screen.findByText('/disco/glossa');

    await user.click(screen.getByRole('button', { name: 'settings.storage.vault.keepTogether' }));

    await waitFor(() => expect(useDefault).toHaveBeenCalled());
    expect(await screen.findByText('/dati/vault')).toBeInTheDocument();
  });


  it('la verifica del deposito si avvia da qui e diventa un lavoro', async () => {
    // D5-bis: è un lavoro, non un'operazione istantanea — si segue dal pannello.
    const { enqueueVaultVerification } = await import('../../services/jobsService');
    const user = userEvent.setup();
    render(<VaultSection />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'settings.storage.vault.verifyQuickTooltip' }));

    expect(enqueueVaultVerification).toHaveBeenCalledWith(false);
  });

  it('la verifica completa è una voce separata, perché apre ogni file', async () => {
    const { enqueueVaultVerification } = await import('../../services/jobsService');
    const user = userEvent.setup();
    render(<VaultSection />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'settings.storage.vault.verifyFullTooltip' }));

    expect(enqueueVaultVerification).toHaveBeenCalledWith(true);
  });

  it('con il deposito non raggiungibile non si verifica niente', async () => {
    getStatus.mockResolvedValue({ path: '/mnt/staccato', reachable: false, isDefault: false });
    render(<VaultSection />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'settings.storage.vault.verifyQuickTooltip' })).toBeDisabled();
  });
});
