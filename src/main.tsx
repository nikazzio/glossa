import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initDatabase } from './services/dbService.ts';
import './i18n';
import './index.css';

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
    // Render anyway (DB may not be available in browser dev mode)
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
