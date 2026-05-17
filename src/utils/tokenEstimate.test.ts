import { describe, it, expect } from 'vitest';
import { estimateCharTokens, getContextWindow, checkContextOverflow } from './tokenEstimate';

describe('estimateCharTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateCharTokens('')).toBe(0);
  });

  it('estimates western text at ~1 token per 4 chars', () => {
    const result = estimateCharTokens('abcdefgh'); // 8 chars → ceil(8/4) = 2
    expect(result).toBe(2);
  });

  it('estimates CJK text at ~1 token per 2 chars', () => {
    const result = estimateCharTokens('你好世界'); // 4 CJK chars → ceil(4/2) = 2
    expect(result).toBe(2);
  });

  it('estimates mixed text correctly', () => {
    // '你好 hi': 2 CJK + 3 western (' ', 'h', 'i') → ceil(2/2 + 3/4) = ceil(1 + 0.75) = 2
    const result = estimateCharTokens('你好 hi');
    expect(result).toBe(2);
  });

  it('is higher for CJK than western for same char count', () => {
    const cjk = estimateCharTokens('你好世界世界世界世界'); // 9 CJK
    const western = estimateCharTokens('hello world!'); // 12 western chars
    expect(cjk).toBeGreaterThan(western);
  });
});

describe('getContextWindow', () => {
  it('returns numCtx for ollama provider', () => {
    expect(getContextWindow('ollama', 'llama3', 4096)).toBe(4096);
  });

  it('returns 8192 as default for ollama when numCtx is null', () => {
    expect(getContextWindow('ollama', 'llama3', null)).toBe(8192);
  });

  it('returns context window from catalog for known models', () => {
    const result = getContextWindow('anthropic', 'claude-sonnet-4-6');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('returns undefined for unknown models', () => {
    expect(getContextWindow('unknown_provider', 'nonexistent-model')).toBeUndefined();
  });
});

describe('checkContextOverflow', () => {
  it('returns null when all models have sufficient context', () => {
    const models = [{ provider: 'ollama', model: 'llama3', numCtx: 128000 }];
    const result = checkContextOverflow('short chunk', 'short prompt', models);
    expect(result).toBeNull();
  });

  it('returns warning when estimated tokens exceed 80% of context window', () => {
    // Small numCtx to force overflow: 10 tokens context, chunk + prompt > 8 tokens
    const longText = 'a'.repeat(200); // ~50 tokens
    const models = [{ provider: 'ollama', model: 'llama3', numCtx: 10 }];
    const result = checkContextOverflow(longText, '', models);
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('ollama');
    expect(result?.modelId).toBe('llama3');
    expect(result?.estimatedTokens).toBeGreaterThan(0);
  });

  it('returns the most restrictive model (smallest context window)', () => {
    const longText = 'a'.repeat(200); // ~50 tokens
    const models = [
      { provider: 'ollama', model: 'big-model', numCtx: 20 },  // 80% = 16 tokens — overflows
      { provider: 'ollama', model: 'small-model', numCtx: 10 }, // 80% = 8 tokens — overflows, smaller
    ];
    const result = checkContextOverflow(longText, '', models);
    expect(result?.modelId).toBe('small-model');
    expect(result?.contextWindow).toBe(10);
  });

  it('returns null when no models are provided', () => {
    expect(checkContextOverflow('text', 'prompt', [])).toBeNull();
  });

  it('accounts for both chunk and prompt tokens separately', () => {
    const chunk = 'a'.repeat(100); // ~25 tokens
    const prompt = 'b'.repeat(100); // ~25 tokens, total ~50
    const models = [{ provider: 'ollama', model: 'm', numCtx: 30 }]; // 80% = 24 < 50 → overflow
    const result = checkContextOverflow(chunk, prompt, models);
    expect(result).not.toBeNull();
  });
});
