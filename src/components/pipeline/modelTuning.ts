import type { ModelProvider, ProviderRuntimeConfig, ReasoningEffortLevel } from '../../types';
import { getResolvedModelReasoning } from '../../models/catalog';

/** Budget di ragionamento Gemini per ogni livello; `-1` = dinamico. */
const GEMINI_THINKING_BUDGET: Record<ReasoningEffortLevel, number> = {
  none: 0,
  low: 1024,
  medium: 8192,
  high: -1,
  xhigh: -1,
};
const GEMINI_LOW_BUDGET_MAX = 1024;

const TEMPERATURE_PROVIDERS: ReadonlySet<ModelProvider> = new Set(['anthropic', 'gemini', 'openai', 'deepseek']);
const ANTHROPIC_TEMPERATURE_MAX = 1;
const DEFAULT_TEMPERATURE_MAX = 2;

/** Taratura di una chiamata a un modello (fase o giudizio): un solo posto per
 *  le regole che prima vivevano in copia nella scheda fase e in quella audit. */
export interface ModelTuning {
  showReasoning: boolean;
  reasoningOptional: boolean;
  reasoningEffort: ReasoningEffortLevel;
  supportsTemperature: boolean;
  temperatureMax: number;
  /** OpenAI e DeepSeek rifiutano o ignorano la temperatura mentre ragionano;
   *  Anthropic non ha questo limite, Gemini la accetta col budget. */
  temperatureBlockedByReasoning: boolean;
  temperature: number | undefined;
}

function readReasoningEffort(
  provider: ModelProvider,
  options: ProviderRuntimeConfig | undefined,
  resolved: ReturnType<typeof getResolvedModelReasoning>,
): ReasoningEffortLevel {
  const fallback: ReasoningEffortLevel = resolved === 'optional' ? 'none' : 'medium';
  if (provider === 'openai') return options?.openai?.reasoningEffort ?? fallback;
  if (provider === 'deepseek') return options?.deepseek?.reasoningEffort ?? fallback;
  if (provider !== 'gemini') return fallback;
  const budget = options?.gemini?.thinkingBudget;
  if (budget == null) return fallback;
  if (budget === 0) return resolved === 'reasoning' ? fallback : 'none';
  if (budget < 0) return 'high';
  return budget <= GEMINI_LOW_BUDGET_MAX ? 'low' : 'medium';
}

function readTemperature(provider: ModelProvider, options: ProviderRuntimeConfig | undefined): number | undefined {
  if (provider === 'anthropic') return options?.anthropic?.temperature;
  if (provider === 'openai') return options?.openai?.temperature;
  if (provider === 'deepseek') return options?.deepseek?.temperature;
  if (provider === 'gemini') return options?.gemini?.temperature;
  return undefined;
}

export function getModelTuning(
  provider: ModelProvider,
  model: string,
  options: ProviderRuntimeConfig | undefined,
): ModelTuning {
  const resolved = getResolvedModelReasoning(provider, model);
  const reasoningEffort = readReasoningEffort(provider, options, resolved);
  return {
    showReasoning: resolved !== undefined && resolved !== 'non_reasoning' && provider !== 'ollama',
    reasoningOptional: resolved === 'optional',
    reasoningEffort,
    supportsTemperature: TEMPERATURE_PROVIDERS.has(provider),
    temperatureMax: provider === 'anthropic' ? ANTHROPIC_TEMPERATURE_MAX : DEFAULT_TEMPERATURE_MAX,
    temperatureBlockedByReasoning:
      (provider === 'openai' || provider === 'deepseek') &&
      !(resolved === 'non_reasoning' || reasoningEffort === 'none'),
    temperature: readTemperature(provider, options),
  };
}

export function withReasoningEffort(
  provider: ModelProvider,
  options: ProviderRuntimeConfig | undefined,
  effort: ReasoningEffortLevel,
): ProviderRuntimeConfig {
  const opts = options ?? {};
  if (provider === 'openai') return { ...opts, openai: { ...opts.openai, reasoningEffort: effort } };
  if (provider === 'deepseek') return { ...opts, deepseek: { ...opts.deepseek, reasoningEffort: effort } };
  if (provider === 'gemini') return { ...opts, gemini: { ...opts.gemini, thinkingBudget: GEMINI_THINKING_BUDGET[effort] } };
  return opts;
}

export function withTemperature(
  provider: ModelProvider,
  options: ProviderRuntimeConfig | undefined,
  temperature: number | undefined,
): ProviderRuntimeConfig {
  const opts = options ?? {};
  if (provider === 'anthropic') return { ...opts, anthropic: { ...opts.anthropic, temperature } };
  if (provider === 'openai') return { ...opts, openai: { ...opts.openai, temperature } };
  if (provider === 'deepseek') return { ...opts, deepseek: { ...opts.deepseek, temperature } };
  if (provider === 'gemini') return { ...opts, gemini: { ...opts.gemini, temperature } };
  return opts;
}

/** Cambiando modello il livello di ragionamento scelto per il precedente non
 *  vale più: torna a quello predefinito del modello nuovo. */
export function withoutReasoningEffort(
  provider: ModelProvider,
  options: ProviderRuntimeConfig | undefined,
): ProviderRuntimeConfig {
  const opts = options ?? {};
  if (provider === 'openai') return { ...opts, openai: { ...opts.openai, reasoningEffort: undefined } };
  if (provider === 'deepseek') return { ...opts, deepseek: { ...opts.deepseek, reasoningEffort: undefined } };
  if (provider === 'gemini') return { ...opts, gemini: { ...opts.gemini, thinkingBudget: undefined } };
  return opts;
}
