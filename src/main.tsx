import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initDatabase } from './services/dbService.ts';
import i18n from './i18n';
import './index.css';

// Tauri v2 injects this global into the webview; absent when running under
// plain `vite dev` in a browser (no Rust backend, no real database file).
export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function DatabaseInitError() {
  return (
    <div className="flex h-screen items-center justify-center bg-editorial-bg px-6 font-sans text-editorial-ink">
      <div className="max-w-md text-center">
        <p className="text-lg font-display italic text-editorial-danger">
          {i18n.t('errors.databaseInitTitle')}
        </p>
        <p className="mt-2 text-sm text-editorial-muted">
          {i18n.t('errors.databaseInitDescription')}
        </p>
      </div>
    </div>
  );
}

// Initialize SQLite database, then render
initDatabase()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err) => {
    console.error('[Glossa] Failed to initialize database:', err);
    const root = createRoot(document.getElementById('root')!);
    if (isTauriRuntime()) {
      // Real app, real failure: schema may be incomplete — don't silently
      // render a UI that will hit "no such table" on first database access.
      root.render(
        <StrictMode>
          <DatabaseInitError />
        </StrictMode>,
      );
    } else {
      // Browser dev mode: no Tauri backend, no database file — expected to fail, render anyway.
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    }
  });
