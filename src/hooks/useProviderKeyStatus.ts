import { useEffect, useState } from 'react';
import { settingsService } from '../services/llmService';

export type ProviderKeyStatusMap = Partial<Record<'gemini' | 'openai' | 'anthropic' | 'deepseek', boolean>>;

const REMOTE_PROVIDERS: Array<keyof ProviderKeyStatusMap> = ['gemini', 'openai', 'anthropic', 'deepseek'];

export function providerNeedsApiKey(provider: string): provider is keyof ProviderKeyStatusMap {
  return REMOTE_PROVIDERS.includes(provider as keyof ProviderKeyStatusMap);
}

export function canRefineWithProvider(
  provider: string,
  statuses: ProviderKeyStatusMap,
): boolean {
  return provider === 'ollama' || !!statuses[provider as keyof ProviderKeyStatusMap];
}

export function formatProviderModelLabel(provider: string, model: string): string {
  return `${provider} · ${model || '—'}`;
}

export function useProviderKeyStatus(): ProviderKeyStatusMap {
  const [statuses, setStatuses] = useState<ProviderKeyStatusMap>({});

  useEffect(() => {
    let cancelled = false;

    Promise.all(
      REMOTE_PROVIDERS.map(async (provider) => [
        provider,
        await settingsService.isKeyConfigured(provider),
      ] as const),
    )
      .then((entries) => {
        if (cancelled) return;
        setStatuses(Object.fromEntries(entries) as ProviderKeyStatusMap);
      })
      .catch(() => {
        if (!cancelled) setStatuses({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return statuses;
}
