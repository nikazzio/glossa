import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initDatabase = vi.hoisted(() => vi.fn(async () => {}));
const isDatabaseSchemaOutdated = vi.hoisted(() => vi.fn(async () => false));

vi.mock('./App.tsx', () => ({ default: () => <div>Glossa</div> }));
vi.mock('./services/dbService.ts', () => ({ initDatabase, isDatabaseSchemaOutdated }));

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

async function loadMain() {
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  return import('./main.tsx');
}

describe('database initialization failure', () => {
  beforeEach(() => {
    initDatabase.mockClear();
    isDatabaseSchemaOutdated.mockClear();
    isDatabaseSchemaOutdated.mockResolvedValue(false);
    delete (window as TauriWindow).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    cleanup();
    delete (window as TauriWindow).__TAURI_INTERNALS__;
  });

  it('identifies the Tauri webview without treating browser development as the app', async () => {
    const { isTauriRuntime } = await loadMain();

    expect(isTauriRuntime()).toBe(false);
    (window as TauriWindow).__TAURI_INTERNALS__ = {};
    expect(isTauriRuntime()).toBe(true);
  });

  it('shows a translated recovery screen without raw database details', async () => {
    const { DatabaseInitError } = await loadMain();
    const { default: i18n } = await import('./i18n');
    await i18n.changeLanguage('en');

    render(<DatabaseInitError />);

    expect(screen.getByText('Could not open the database')).toBeInTheDocument();
    expect(screen.getByText(/Restart Glossa/)).toBeInTheDocument();
    expect(screen.queryByText(/glossa\.db/i)).not.toBeInTheDocument();
  });
});

describe('outdated schema confirmation gate', () => {
  beforeEach(() => {
    initDatabase.mockClear();
    isDatabaseSchemaOutdated.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the app directly when the schema is current, without prompting', async () => {
    isDatabaseSchemaOutdated.mockResolvedValue(false);
    await loadMain();

    await waitFor(() => expect(screen.getByText('Glossa')).toBeInTheDocument());
    expect(initDatabase).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before resetting an outdated schema, then proceeds on confirm', async () => {
    isDatabaseSchemaOutdated.mockResolvedValue(true);
    const { default: i18n } = await import('./i18n');
    await i18n.changeLanguage('en');
    await loadMain();

    const confirmButton = await screen.findByRole('button', { name: 'Continue and recreate the database' });
    expect(initDatabase).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(confirmButton);

    await waitFor(() => expect(screen.getByText('Glossa')).toBeInTheDocument());
    expect(initDatabase).toHaveBeenCalledTimes(1);
  });

  it('never resets the database when the user cancels', async () => {
    isDatabaseSchemaOutdated.mockResolvedValue(true);
    const { default: i18n } = await import('./i18n');
    await i18n.changeLanguage('en');
    await loadMain();

    const cancelButton = await screen.findByRole('button', { name: 'Cancel, close Glossa' });
    const user = userEvent.setup();
    await user.click(cancelButton);

    await waitFor(() => expect(screen.getByText('Operation cancelled')).toBeInTheDocument());
    expect(initDatabase).not.toHaveBeenCalled();
  });
});
