import { attachConsole, debug, error, info, warn } from '@tauri-apps/plugin-log';

let attached = false;

export async function initLogger(): Promise<void> {
  try {
    await attachConsole();
    attached = true;
  } catch {
    // Not in Tauri context (tests, Storybook) — console fallback is used automatically
  }
}

/** Messaggio leggibile da un errore intercettato in un `catch`, per log e
 * stato interno — mai per il testo a schermo, che resta un messaggio tradotto
 * fisso (vedi `dashboard.discovery.searchFailed` e affini). Stesso schema già
 * usato (a mano, in decine di punti) in tutta l'app: `Error.message` quando
 * c'è, altrimenti `String(error)` — i comandi Tauri respingono con una
 * stringa nuda, non un `Error`, e `String` la restituisce inalterata. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    const formatted = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
    if (attached) void debug(formatted);
    else console.debug('[glossa]', formatted);
  },
  info: (msg: string, ctx?: Record<string, unknown>) => {
    const formatted = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
    if (attached) void info(formatted);
    else console.info('[glossa]', formatted);
  },
  warn: (msg: string, ctx?: Record<string, unknown>) => {
    const formatted = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
    if (attached) void warn(formatted);
    else console.warn('[glossa]', formatted);
  },
  error: (msg: string, ctx?: Record<string, unknown>) => {
    const formatted = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
    if (attached) void error(formatted);
    else console.error('[glossa]', formatted);
  },
};
