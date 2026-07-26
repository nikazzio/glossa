import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initDatabase = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('./App.tsx', () => ({ default: () => <div>Glossa</div> }));
vi.mock('./services/dbService.ts', () => ({ initDatabase }));

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

async function loadMain() {
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  return import('./main.tsx');
}

describe('database initialization failure', () => {
  beforeEach(() => {
    initDatabase.mockClear();
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

describe('boot', () => {
  beforeEach(() => {
    initDatabase.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('opens the connection and renders the app', async () => {
    await loadMain();

    await waitFor(() => expect(screen.getByText('Glossa')).toBeInTheDocument());
    expect(initDatabase).toHaveBeenCalledTimes(1);
  });
});
