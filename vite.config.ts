/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

/**
 * pdf.js carica i suoi ripieghi JS puro (`*_nowasm_fallback.js`, quando il
 * decoder WASM non parte) con un `import()` dinamico dentro il proprio
 * worker. Vite rifiuta di servire così qualunque file di `public/`, per
 * disegno: li tratta come asset statici, non moduli, e l'`import()` fallisce
 * con "should not be imported from source code" anche se il file esiste
 * davvero. Questo middleware intercetta solo queste due richieste, prima che
 * la pipeline di trasformazione di Vite le veda, e le serve come testo
 * JavaScript grezzo.
 */
function pdfjsWasmFallbackPlugin(): Plugin {
  const dir = path.resolve(__dirname, 'public/pdfjs');
  return {
    name: 'pdfjs-wasm-fallback-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/pdfjs\/([\w-]+_nowasm_fallback\.js)(?:\?.*)?$/);
        if (!match) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(path.join(dir, match[1])));
      });
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react(), tailwindcss(), pdfjsWasmFallbackPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    clearScreen: false,
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // i18n first — react-i18next contains "react" so must be checked before the react group
            if (id.includes('i18next')) return 'vendor-i18n';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('/use-sync-external-store/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('/node_modules/motion/')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@tauri-apps')) return 'vendor-tauri';
            return 'vendor';
          },
        },
      },
      // Threshold raised from default 500 kB: vendor chunks (react + motion + icons)
      // each sit around 400-550 kB uncompressed (minified) — roughly 150-200 kB gzipped.
      chunkSizeWarningLimit: 600,
    },
    test: {
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Thread invece di processi: avviarli costa una frazione, e le prove non
      // hanno bisogno di stare in processi separati.
      pool: 'threads',
      // Il finto browser costa più di tutto il resto messo insieme: montarlo
      // per una prova che non tocca lo schermo è tempo buttato a ogni giro.
      // Le prove dei componenti e degli hook lo hanno, le altre no.
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: ['src/**/*.test.ts'],
            exclude: ['src/hooks/**', 'src/components/**', 'src/stores/**'],
            setupFiles: ['./src/test/setup.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: [
              'src/**/*.test.tsx',
              'src/hooks/**/*.test.ts',
              'src/components/**/*.test.ts',
              'src/stores/**/*.test.ts',
            ],
            setupFiles: ['./src/test/setup.ts'],
          },
        },
      ],
    },
  };
});
