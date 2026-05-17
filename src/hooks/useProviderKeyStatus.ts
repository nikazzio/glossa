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

export function useProviderKeyStatus(): { statuses: ProviderKeyStatusMap; isLoading: boolean; refresh: () => void } {
  const [statuses, setStatuses] = useState<ProviderKeyStatusMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all(
      REMOTE_PROVIDERS.map(async (provider) => [
        provider,
        await settingsService.isKeyConfigured(provider),
      ] as const),
    )
      .then((entries) => {
        if (cancelled) return;
        setStatuses(Object.fromEntries(entries) as ProviderKeyStatusMap);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setStatuses({});
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { statuses, isLoading, refresh };
}
