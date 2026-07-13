import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, classifyError, friendlyError } from './retry';

describe('classifyError', () => {
  it('detects config errors', () => {
    expect(classifyError('API key not configured')).toBe('config');
    expect(classifyError('Unknown provider: foo')).toBe('config');
    expect(classifyError('Set it in Settings.')).toBe('config');
  });

  it('detects rate limit errors', () => {
    expect(classifyError('rate limit exceeded')).toBe('rate_limit');
    expect(classifyError('HTTP 429 Too Many Requests')).toBe('rate_limit');
    expect(classifyError('quota exceeded')).toBe('rate_limit');
  });

  it('detects quota exceeded errors as distinct from a transient rate limit', () => {
    expect(classifyError('HTTP request failed: 429: {"error":{"type":"insufficient_quota","message":"You exceeded your current quota, please check your plan and billing details."}}')).toBe('quota_exceeded');
    expect(classifyError('429: insufficient_quota')).toBe('quota_exceeded');
  });

  it('detects context overflow errors', () => {
    expect(classifyError('context window exceeded')).toBe('context_overflow');
    expect(classifyError('context_length_exceeded')).toBe('context_overflow');
    expect(classifyError('maximum context reached')).toBe('context_overflow');
    expect(classifyError('input too large for model')).toBe('context_overflow');
    expect(classifyError('HTTP status 413')).toBe('context_overflow');
  });

  it('detects network errors', () => {
    expect(classifyError('network error')).toBe('network');
    expect(classifyError('fetch failed')).toBe('network');
    expect(classifyError('ECONNREFUSED')).toBe('network');
    expect(classifyError('timeout')).toBe('network');
  });

  it('detects parse errors', () => {
    expect(classifyError('unexpected token in JSON')).toBe('parse');
    expect(classifyError('Failed to parse response')).toBe('parse');
  });

  it('detects API errors', () => {
    expect(classifyError('API error (500)')).toBe('api');
    expect(classifyError('request failed with status 502')).toBe('api');
  });

  it('returns unknown for unrecognized errors', () => {
    expect(classifyError('something weird happened')).toBe('unknown');
  });
});

describe('friendlyError', () => {
  it('passes config errors through', () => {
    expect(friendlyError('API key not configured')).toBe('API key not configured');
  });

  it('returns friendly message for rate limits', () => {
    expect(friendlyError('rate limit 429')).toContain('Rate limit');
  });

  it('returns a distinct friendly message for quota exhaustion, without implying an automatic retry', () => {
    const message = friendlyError('429: insufficient_quota');
    expect(message).toContain('quota');
    expect(message).not.toContain('retried automatically');
  });

  it('returns friendly message for network errors', () => {
    expect(friendlyError('network error')).toContain('Network error');
  });

  it('returns friendly message for parse errors', () => {
    expect(friendlyError('unexpected token in JSON')).toContain('unexpected response');
  });

  it('extracts HTTP status from API errors', () => {
    expect(friendlyError('API error (503): service unavailable')).toContain('HTTP 503');
  });

  it('truncates long unknown errors', () => {
    const longMsg = 'x'.repeat(200);
    const result = friendlyError(longMsg);
    expect(result.length).toBeLessThanOrEqual(121);
  });

  it('returns friendly message for context overflow (413 in message)', () => {
    expect(friendlyError('context window exceeded, 413')).toContain('Context window exceeded');
  });

  it('returns Ollama message as-is for context overflow', () => {
    const msg = 'Ollama context window exceeded — reduce chunk size or increase numCtx in Ollama provider settings.';
    expect(friendlyError(msg)).toBe(msg);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry config errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('API key not configured'));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })).rejects.toThrow('not configured');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on network errors and succeeds', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throws after exhausting retries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry malformed model output', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failed to parse judge JSON'));

    await expect(withRetry(fn, { baseDelayMs: 10 })).rejects.toThrow('parse judge JSON');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a timeout only once', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fn = vi.fn().mockRejectedValue(new Error('request timed out'));

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    const result = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20);
    await result;

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses the server retry delay when available', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited; retry-after-ms=250'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { baseDelayMs: 10, onRetry });
    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBe('recovered');
    expect(onRetry).toHaveBeenCalledWith(1, 4, expect.any(String), 250);
  });

  it('keeps Retry-After timing exact while polling for cancellation', async () => {
    const shouldCancel = vi.fn(() => false);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited; retry-after-ms=250'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { baseDelayMs: 10, shouldCancel });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(249);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
