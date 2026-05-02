/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@tauri-apps')) return 'vendor-tauri';
            return 'vendor';
          },
        },
      },
      // Threshold raised from default 500 kB: vendor chunks (react + motion + icons)
      // each sit around 150-200 kB gzipped and are expected to be large.
      chunkSizeWarningLimit: 600,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
