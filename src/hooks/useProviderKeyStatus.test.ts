import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canRefineWithProvider,
  formatProviderModelLabel,
  providerNeedsApiKey,
  useProviderKeyStatus,
} from './useProviderKeyStatus';

const settingsMocks = vi.hoisted(() => ({
  isKeyConfigured: vi.fn(),
}));

vi.mock('../services/llmService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/llmService')>(
      '../services/llmService',
    );
  return {
    ...actual,
    settingsService: settingsMocks,
  };
});

describe('providerNeedsApiKey', () => {
  it('marks remote providers as requiring a key', () => {
    expect(providerNeedsApiKey('gemini')).toBe(true);
    expect(providerNeedsApiKey('openai')).toBe(true);
    expect(providerNeedsApiKey('anthropic')).toBe(true);
    expect(providerNeedsApiKey('deepseek')).toBe(true);
  });

  it('does not mark ollama or unknown providers as requiring a key', () => {
    expect(providerNeedsApiKey('ollama')).toBe(false);
    expect(providerNeedsApiKey('whatever')).toBe(false);
  });
});

describe('canRefineWithProvider', () => {
  it('always allows ollama regardless of configured statuses', () => {
    expect(canRefineWithProvider('ollama', {})).toBe(true);
    expect(canRefineWithProvider('ollama', { openai: false })).toBe(true);
  });

  it('requires a configured key for remote providers', () => {
    expect(canRefineWithProvider('openai', {})).toBe(false);
    expect(canRefineWithProvider('openai', { openai: false })).toBe(false);
    expect(canRefineWithProvider('openai', { openai: true })).toBe(true);
  });

  it('checks each provider independently', () => {
    const statuses = { gemini: true, openai: false, anthropic: true, deepseek: false };
    expect(canRefineWithProvider('gemini', statuses)).toBe(true);
    expect(canRefineWithProvider('openai', statuses)).toBe(false);
    expect(canRefineWithProvider('anthropic', statuses)).toBe(true);
    expect(canRefineWithProvider('deepseek', statuses)).toBe(false);
  });
});

describe('formatProviderModelLabel', () => {
  it('returns provider · model when both are present', () => {
    expect(formatProviderModelLabel('openai', 'gpt-4o-mini')).toBe('openai · gpt-4o-mini');
  });

  it('returns a placeholder when the model is empty', () => {
    expect(formatProviderModelLabel('ollama', '')).toBe('ollama · —');
  });
});

describe('useProviderKeyStatus', () => {
  beforeEach(() => {
    settingsMocks.isKeyConfigured.mockReset();
  });

  it('returns the configured status for every remote provider', async () => {
    settingsMocks.isKeyConfigured.mockImplementation(async (provider: string) => {
      return provider === 'gemini' || provider === 'anthropic';
    });

    const { result } = renderHook(() => useProviderKeyStatus());

    await waitFor(() => {
      expect(result.current).toEqual({
        gemini: true,
        openai: false,
        anthropic: true,
        deepseek: false,
      });
    });

    expect(settingsMocks.isKeyConfigured).toHaveBeenCalledWith('gemini');
    expect(settingsMocks.isKeyConfigured).toHaveBeenCalledWith('openai');
    expect(settingsMocks.isKeyConfigured).toHaveBeenCalledWith('anthropic');
    expect(settingsMocks.isKeyConfigured).toHaveBeenCalledWith('deepseek');
  });

  it('falls back to an empty status map when the lookup fails', async () => {
    settingsMocks.isKeyConfigured.mockRejectedValue(new Error('keychain offline'));

    const { result } = renderHook(() => useProviderKeyStatus());

    await waitFor(() => {
      expect(settingsMocks.isKeyConfigured).toHaveBeenCalled();
    });
    expect(result.current).toEqual({});
  });

  it('combines with canRefineWithProvider so ollama stays usable with no remote keys', async () => {
    settingsMocks.isKeyConfigured.mockResolvedValue(false);

    const { result } = renderHook(() => useProviderKeyStatus());

    await waitFor(() => {
      expect(result.current.openai).toBe(false);
    });
    expect(canRefineWithProvider('ollama', result.current)).toBe(true);
    expect(canRefineWithProvider('openai', result.current)).toBe(false);
    expect(canRefineWithProvider('gemini', result.current)).toBe(false);
  });
});
