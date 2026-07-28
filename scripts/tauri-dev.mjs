// Wrapper Node (non bash) per restare cross-platform: bash non è garantito
// su Windows. Inietta la porta dev nel devUrl di Tauri via --config, così
// resta sincronizzata con Vite senza toccare tauri.conf.json a mano.
import { spawn } from 'node:child_process';
import { resolveDevPort } from './devPort.mjs';

const port = resolveDevPort();
const devUrl = `http://localhost:${port}`;

const env = { ...process.env, GLOSSA_DEV_PORT: port };
// WEBKIT_*/GSETTINGS_* riguardano solo WebKitGTK (Linux); su Windows/macOS
// Tauri usa WebView2/WKWebView e non li legge, ma settarli lì è comunque no-op.
if (process.platform === 'linux') {
  env.WEBKIT_DISABLE_DMABUF_RENDERER = '1';
  env.GSETTINGS_BACKEND = 'memory';
  // Tutti gli avvii Linux di Glossa passano da WSL2/WSLg. Questa combinazione,
  // verificata lì, evita sia il compositore WebKit sia i percorsi GPU che dopo
  // un riavvio possono creare una finestra presente nella taskbar ma invisibile.
  env.LIBGL_ALWAYS_SOFTWARE = '1';
  env.WEBKIT_DISABLE_COMPOSITING_MODE = '1';
}

const child = spawn(
  'tauri',
  ['dev', '--config', JSON.stringify({ build: { devUrl } })],
  { stdio: 'inherit', env },
);

child.on('exit', (code) => process.exit(code ?? 1));
