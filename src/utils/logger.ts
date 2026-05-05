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
