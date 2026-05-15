import type { PipelineStageConfig, ModelProvider } from './types';
import { MODEL_CATALOG } from './models/catalog';

export const DEFAULT_STAGES: PipelineStageConfig[] = [
  {
    id: 'stg-translation',
    name: 'Translation',
    role: 'translation',
    prompt: 'Translate the text accurately.',
    model: 'gpt-4o-mini',
    provider: 'openai',
    enabled: true,
  },
];

export const DEFAULT_JUDGE_PROMPT =
  'Audit the final translation for accuracy, glossary adherence, and concrete issues.';

export const DEFAULT_COHERENCE_PROMPT =
  'Check for terminology consistency, narrative continuity, and glossary adherence across segment boundaries.';

export const MODEL_OPTIONS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash-lite-preview'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-haiku-latest'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: [], // Dynamic — populated at runtime from local Ollama instance
};

// Derived from MODEL_CATALOG — edit catalog.ts to update prices
export const MODEL_PRICING: Record<string, { input: number; output: number }> = Object.fromEntries(
  MODEL_CATALOG
    .filter((e) => e.pricing)
    .map((e) => [`${e.provider}/${e.id}`, e.pricing!]),
);

export function defaultPersonaText(source: string, target: string): string {
  return `You are an expert translator and linguist specialized in ${source} to ${target} translation.`;
}

export const LANGUAGES = [
  'English',
  'Italian',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Japanese',
  'Chinese',
  'Korean',
  'Russian',
];
