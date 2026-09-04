import { useState } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryLibrariesSection } from './LibraryLibrariesSection';
import { LibraryProfilesSection } from './LibraryProfilesSection';
import {
  useLibraryNetworkSettings,
  type NetworkProfileDraft,
} from '../../hooks/useLibraryNetworkSettings';
import {
  listNetworkSettings,
  saveNetworkProfile,
  setLibraryProfile,
  setLibrarySizePolicy,
  type NetworkSettings,
  type NetworkValues,
} from '../../services/downloadSettingsService';

vi.mock('../../services/downloadSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/downloadSettingsService')>();
  return {
    ...actual,
    listNetworkSettings: vi.fn(),
    saveNetworkProfile: vi.fn(),
    deleteNetworkProfile: vi.fn(),
    setLibraryProfile: vi.fn(),
    setLibrarySizePolicy: vi.fn(),
  };
});

const values: NetworkValues = {
  burstRequests: 240,
  burstWindowSecs: 60,
  cooldown403Secs: 120,
  cooldown429Secs: 120,
  hostConcurrency: 4,
  workersPerJob: 2,
  maxAttempts: 5,
  backoffBaseSecs: 15,
  backoffCapSecs: 300,
  connectTimeoutSecs: 15,
  readTimeoutSecs: 30,
  needsViewerWarmup: false,
};

const settings: NetworkSettings = {
  profiles: [
    { id: 'normale', name: 'Normale', builtin: true, values, usedBy: 10 },
    { id: 'lento', name: 'Lento', builtin: true, values: { ...values, maxAttempts: 3 }, usedBy: 1 },
  ],
  libraries: [
    { key: 'gallica', label: 'Gallica', profileId: 'lento', sizePolicy: 'auto' },
    { key: 'archive_org', label: 'Internet Archive', profileId: 'normale', sizePolicy: 'readyOnly' },
  ],
};

const list = vi.mocked(listNetworkSettings);
const save = vi.mocked(saveNetworkProfile);
const choose = vi.mocked(setLibraryProfile);
const chooseSizePolicy = vi.mocked(setLibrarySizePolicy);

/**
 * Le due sezioni come le monta la scheda Biblioteca — biblioteche sopra,
 * profili sotto — senza le misure delle immagini, che leggono altri servizi.
 * Quello che si sta scrivendo lo tiene la finestra: qui lo tiene la prova.
 */
function Harness() {
  const [draft, setDraft] = useState<NetworkProfileDraft | null>(null);
  const { settings, activeId, setActiveId, saveProfile, removeProfile, chooseProfile, chooseSizePolicy } =
    useLibraryNetworkSettings();
  return (
    <>
      <LibraryLibrariesSection
        settings={settings}
        onChooseProfile={(key, id) => void chooseProfile(key, id)}
        onChooseSizePolicy={(key, policy) => void chooseSizePolicy(key, policy)}
      />
      <LibraryProfilesSection
        settings={settings}
        activeId={activeId}
        setActiveId={setActiveId}
        draft={draft}
        setDraft={setDraft}
        onSave={saveProfile}
        onRemove={(id) => void removeProfile(id)}
      />
    </>
  );
}

describe('profili di rete', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue(settings);
    save.mockReset().mockResolvedValue(settings);
    choose.mockReset().mockResolvedValue(settings);
    chooseSizePolicy.mockReset().mockResolvedValue(settings);
  });

  it('elenca i profili con quante biblioteche li usano', async () => {
    render(<Harness />);

    const profiles = await screen.findByLabelText('settings.network.selectedProfile');
    expect(profiles).toHaveValue('normale');
    expect(screen.getByRole('option', { name: /Lento.*usedBy/ })).toBeInTheDocument();
  });

  it('apre il primo profilo con i suoi valori', async () => {
    render(<Harness />);

    expect(await screen.findByLabelText('settings.network.field.maxAttempts')).toHaveValue(5);
  });

  it('salva i valori cambiati del profilo scelto', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // I campi si rimontano quando arrivano i profili: prima si aspetta
    // l'elenco, altrimenti si scrive dentro un campo già sostituito.
    await screen.findByLabelText('settings.network.selectedProfile');
    const attempts = screen.getByLabelText('settings.network.field.maxAttempts');

    await user.clear(attempts);
    await user.type(attempts, '4');
    await user.click(screen.getByRole('button', { name: 'settings.network.save' }));

    expect(save).toHaveBeenCalledWith({
      id: 'normale',
      name: 'Normale',
      values: expect.objectContaining({ maxAttempts: 4 }),
    });
  });

  it('crea un profilo nuovo anche mantenendo i valori proposti', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByLabelText('settings.network.selectedProfile');

    await user.click(screen.getByRole('button', { name: 'settings.network.newProfile' }));
    await user.clear(screen.getByLabelText('settings.network.name'));
    await user.type(screen.getByLabelText('settings.network.name'), 'Notturno');
    await user.click(screen.getByRole('button', { name: 'settings.network.save' }));

    expect(save).toHaveBeenCalledWith({
      id: null,
      name: 'Notturno',
      values,
    });
  });

  it('dice che ci sono modifiche non salvate, e le lascia buttare', async () => {
    // Il salvataggio qui è esplicito: senza un segno, si chiude la finestra
    // credendo di aver salvato.
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByLabelText('settings.network.selectedProfile');
    expect(screen.queryByText('settings.network.unsaved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.network.save' })).toBeDisabled();

    await user.clear(screen.getByLabelText('settings.network.field.maxAttempts'));
    await user.type(screen.getByLabelText('settings.network.field.maxAttempts'), '4');

    expect(screen.getByText('settings.network.unsaved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.network.discard' }));

    expect(screen.queryByText('settings.network.unsaved')).not.toBeInTheDocument();
    expect(screen.getByLabelText('settings.network.field.maxAttempts')).toHaveValue(5);
    expect(save).not.toHaveBeenCalled();
  });

  it('ogni biblioteca sceglie il suo profilo', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      await screen.findByLabelText('Internet Archive · settings.network.rhythm'),
      'lento',
    );

    expect(choose).toHaveBeenCalledWith('archive_org', 'lento');
  });

  it('ogni biblioteca sceglie come chiedere le immagini', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      await screen.findByLabelText('Gallica · settings.network.imageRequestMode'),
      'readyOnly',
    );

    expect(chooseSizePolicy).toHaveBeenCalledWith('gallica', 'readyOnly');
  });
});
