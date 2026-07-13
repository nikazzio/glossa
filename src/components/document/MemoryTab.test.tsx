import { describe, expect, it } from 'vitest';
import { memorySearchErrorKey } from './MemoryTab';

describe('memorySearchErrorKey', () => {
  it('tells quota exhaustion apart from a transient rate limit', () => {
    const quotaError = new Error(
      'HTTP request failed: 429: {"error":{"type":"insufficient_quota","message":"You exceeded your current quota"}}',
    );
    expect(memorySearchErrorKey(quotaError)).toBe('memory.searchFailedQuota');
  });

  it('flags a transient rate limit distinctly from quota exhaustion', () => {
    expect(memorySearchErrorKey(new Error('rate limit exceeded, retry-after-ms=2000'))).toBe(
      'memory.searchFailedRateLimit',
    );
  });

  it('flags a missing or invalid API key', () => {
    expect(memorySearchErrorKey(new Error('API key not configured'))).toBe('memory.searchFailedConfig');
  });

  it('flags a network error', () => {
    expect(memorySearchErrorKey(new Error('network error: ECONNREFUSED'))).toBe('memory.searchFailedNetwork');
  });

  it('falls back to the generic message for anything unrecognized', () => {
    expect(memorySearchErrorKey(new Error('something weird happened'))).toBe('memory.searchFailed');
  });

  it('handles non-Error rejections without throwing', () => {
    expect(memorySearchErrorKey('insufficient_quota')).toBe('memory.searchFailedQuota');
  });
});
