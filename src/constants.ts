import type { PipelineStageConfig, ModelProvider } from './types';
import { MODEL_CATALOG } from './models/catalog';

export const DEFAULT_STAGES: PipelineStageConfig[] = [
  {
    id: 'stg-draft',
    name: 'Initial Pass',
    prompt: 'Perform an initial translation pass. Focus on literal meaning and linguistic accuracy.',
    model: 'gemini-3-flash-preview',
    provider: 'gemini',
    enabled: true,
  },
  {
    id: 'stg-style',
    name: 'Refinement',
    prompt: 'Rewrite the translation to sound more natural, fluent, and professional. Match the intended tone.',
    model: 'gemini-3-flash-preview',
    provider: 'gemini',
    enabled: true,
  },
];

export const DEFAULT_JUDGE_PROMPT =
  'Audit the final translation for technical accuracy, glossary adherence, and natural tone.';

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
