import { STREAM_CANCELLED_ERROR } from '../services/llmService';

/**
 * Retry with exponential backoff.
 * Retries on network/rate-limit errors; gives up immediately on config errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    baseDelayMs?: number;
    label?: string;
    onRetry?: (attempt: number, total: number, error: string, delayMs: number) => void;
    shouldCancel?: () => boolean;
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = 'operation', onRetry, shouldCancel } = opts;
  let timeoutRetried = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      throwIfCancelled(shouldCancel);
      return await fn();
    } catch (err: unknown) {
      const message = errorMessage(err);

      if (isConfigError(message) || isParseError(message) || message.includes(STREAM_CANCELLED_ERROR)) throw err;
      if (attempt === maxRetries) throw err;
      if (isTimeoutError(message) && timeoutRetried) throw err;
      if (isTimeoutError(message)) timeoutRetried = true;

      const retryAfterMs = retryAfterDelay(message);
      const delay = retryAfterMs ?? baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      const delayMs = Math.max(1, Math.ceil(delay));
      console.warn(
        `[Glossa] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms: ${message}`,
      );
      onRetry?.(attempt + 1, maxRetries + 1, message, delayMs);
      await sleep(delay, shouldCancel);
    }
  }

  throw new Error(`${label} failed after ${maxRetries + 1} attempts`);
}

export function is429Error(message: string): boolean {
  return /rate.?limit|429|quota/i.test(message);
}

function isTimeoutError(message: string): boolean {
  const timeoutPatterns = [
    'timed out',
    'timeout',
    'stream exceeded',
  ];
  return timeoutPatterns.some((p) => message.toLowerCase().includes(p));
}

function isConfigError(message: string): boolean {
  const configPatterns = [
    'not configured',
    'Unknown provider',
    'Unsupported provider',
    'Keyring error',
    'Set it in Settings',
    'not authorized',
    'unauthorized',
    'forbidden',
    'invalid api key',
  ];
  return /\b(401|403)\b/.test(message) || configPatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

function isParseError(message: string): boolean {
  return /parse|JSON|unexpected token|invalid judge response/i.test(message);
}

function retryAfterDelay(message: string): number | undefined {
  const match = message.match(/retry-after-ms=(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwIfCancelled(shouldCancel: (() => boolean) | undefined): void {
  if (shouldCancel?.()) throw new Error(STREAM_CANCELLED_ERROR);
}

function sleep(ms: number, shouldCancel?: () => boolean): Promise<void> {
  const delayMs = Math.max(1, Math.ceil(ms));
  if (!shouldCancel) return new Promise((resolve) => setTimeout(resolve, delayMs));

  return new Promise((resolve, reject) => {
    if (shouldCancel()) {
      reject(new Error(STREAM_CANCELLED_ERROR));
      return;
    }

    const cancelTimer = setInterval(() => {
      if (shouldCancel()) {
        clearTimeout(delayTimer);
        clearInterval(cancelTimer);
        reject(new Error(STREAM_CANCELLED_ERROR));
      }
    }, Math.min(100, delayMs));
    const delayTimer = setTimeout(() => {
      clearInterval(cancelTimer);
      resolve();
    }, delayMs);
  });
}

/** Classify an error string into a user-friendly category */
export type ErrorCategory = 'config' | 'network' | 'rate_limit' | 'context_overflow' | 'api' | 'parse' | 'unknown';

export function classifyError(message: string): ErrorCategory {
  if (isConfigError(message)) return 'config';
  if (/rate.?limit|429|quota/i.test(message)) return 'rate_limit';
  if (/context.window.exceeded|context_length_exceeded|maximum context|input too large|413/i.test(message)) return 'context_overflow';
  if (/network|fetch|timeout|ECONNREFUSED|ENOTFOUND/i.test(message)) return 'network';
  if (/parse|JSON|unexpected token/i.test(message)) return 'parse';
  if (/API error|request failed|status/i.test(message)) return 'api';
  return 'unknown';
}

/** Get a user-friendly error message */
export function friendlyError(message: string): string {
  if (/ollama/i.test(message)) return message;
  const cat = classifyError(message);
  switch (cat) {
    case 'config':
      return message; // Already user-friendly from backend
    case 'rate_limit':
      return 'Rate limit reached. The request will be retried automatically.';
    case 'context_overflow':
      return 'Context window exceeded. Reduce the chunk size in Settings or switch to a model with a larger context window.';
    case 'network':
      return 'Network error. Please check your internet connection.';
    case 'parse':
      return 'The AI returned an unexpected response format.';
    case 'api':
      // Extract status code if present, strip raw response body
      const statusMatch = message.match(/\((\d{3})\)/);
      return statusMatch
        ? `API error (HTTP ${statusMatch[1]}). Please try again.`
        : 'API error. Please try again.';
    default:
      return message.length > 120 ? message.slice(0, 120) + '…' : message;
  }
}
