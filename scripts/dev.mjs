// Wrapper Node (non bash) per restare cross-platform: npm su Windows esegue
// gli script tramite cmd.exe, che non capisce la sintassi `${VAR:-default}`.
import { spawn } from 'node:child_process';
import { resolveDevPort } from './devPort.mjs';

const port = resolveDevPort();

const child = spawn('vite', ['--port', port, '--strictPort', '--host', '0.0.0.0'], {
  stdio: 'inherit',
  env: { ...process.env, GLOSSA_DEV_PORT: port },
});

child.on('exit', (code) => process.exit(code ?? 1));
