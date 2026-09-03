import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// react-resizable-panels (shell #291) misura via ResizeObserver: jsdom non lo fornisce.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// OpenSeadragon (visore Biblioteca) è pesante da istanziare per davvero
// (canvas, immagini, coda di richieste) e jsdom non gli offre un ambiente
// completo (niente `matchMedia`, `getContext` finto). Nessun test qui dentro
// verifica il motore di zoom in sé: basta un guscio minimo con gli stessi
// punti che i componenti chiamano, come già per le API Tauri sotto.
vi.mock('openseadragon', () => {
  function OpenSeadragon() {
    return {
      viewport: { zoomBy: vi.fn(), goHome: vi.fn() },
      open: vi.fn(),
      destroy: vi.fn(),
    };
  }
  OpenSeadragon.IIIFTileSource = class {};
  return { default: OpenSeadragon };
});

// Mock Tauri APIs globally
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(() =>
      Promise.resolve({
        execute: vi.fn(),
        select: vi.fn(() => Promise.resolve([])),
      })
    ),
  },
}));

// Mock i18n — returns the key itself
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));
