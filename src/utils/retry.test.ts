import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
