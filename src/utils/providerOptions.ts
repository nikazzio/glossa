import type { OllamaConfig } from '../types';

export function defaultOllamaConfig(): OllamaConfig {
  return {
    temperature: 0.1,
    topP: 1,
    seed: null,
    keepAlive: '15m',
    think: false,
    numCtx: 8192,
    numPredict: null,
    useAdvancedOptions: false,
    advancedOptions: {},
  };
}
