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
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = 'operation', onRetry } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const message: string = err?.message ?? String(err);

      if (isConfigError(message) || message.includes(STREAM_CANCELLED_ERROR) || isTimeoutError(message)) throw err;
      if (attempt === maxRetries) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      const delayMs = Math.round(delay);
      console.warn(
        `[Glossa] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms: ${message}`,
      );
      onRetry?.(attempt + 1, maxRetries + 1, message, delayMs);
      await sleep(delay);
    }
  }

  throw new Error(`${label} failed after ${maxRetries + 1} attempts`);
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
  ];
  return configPatterns.some((p) => message.includes(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Classify an error string into a user-friendly category */
export type ErrorCategory = 'config' | 'network' | 'rate_limit' | 'api' | 'parse' | 'unknown';

export function classifyError(message: string): ErrorCategory {
  if (isConfigError(message)) return 'config';
  if (/rate.?limit|429|quota/i.test(message)) return 'rate_limit';
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
