import {StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import App from './App.tsx';
import { initDatabase, isDatabaseSchemaOutdated } from './services/dbService.ts';
import { AlertDialog } from './components/ui/AlertDialog.tsx';
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

export function SchemaResetCancelled() {
  return (
    <div className="flex h-screen items-center justify-center bg-editorial-bg px-6 font-sans text-editorial-ink">
      <div className="max-w-md text-center">
        <p className="text-lg font-display italic text-editorial-danger">
          {i18n.t('errors.schemaResetCancelledTitle')}
        </p>
        <p className="mt-2 text-sm text-editorial-muted">
          {i18n.t('errors.schemaResetCancelledDescription')}
        </p>
      </div>
    </div>
  );
}

export function SchemaResetPrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={i18n.t('errors.schemaResetTitle')}
      description={i18n.t('errors.schemaResetDescription')}
      confirmLabel={i18n.t('errors.schemaResetConfirm')}
      cancelLabel={i18n.t('errors.schemaResetCancel')}
      onConfirm={onConfirm}
      tone="danger"
    />
  );
}

function confirmSchemaReset(root: Root): Promise<boolean> {
  return new Promise((resolve) => {
    root.render(
      <StrictMode>
        <SchemaResetPrompt onConfirm={() => resolve(true)} onCancel={() => resolve(false)} />
      </StrictMode>,
    );
  });
}

const root = createRoot(document.getElementById('root')!);

// Initialize SQLite database, then render. When the on-disk database
// predates this build's schema, ask before initDatabase() backs it up and
// wipes the mismatched tables — a silent wipe would delete work the user
// deliberately kept around (e.g. after restoring an older backup).
async function boot(): Promise<void> {
  if (await isDatabaseSchemaOutdated()) {
    const proceed = await confirmSchemaReset(root);
    if (!proceed) {
      root.render(
        <StrictMode>
          <SchemaResetCancelled />
        </StrictMode>,
      );
      return;
    }
  }

  await initDatabase();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((err) => {
  console.error('[Glossa] Failed to initialize database:', err);
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
