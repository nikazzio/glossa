import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initDatabase = vi.hoisted(() => vi.fn(async () => {}));
const roots = vi.hoisted(() => [] as Root[]);
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return {...actual,createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    const root=actual.createRoot(...args); roots.push(root); return root;
  }};
});
afterEach(() => { act(() => { for (const root of roots.splice(0)) root.unmount(); }); });

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
