import type { PipelineStageConfig, ModelProvider } from './types';

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

// Prezzi in USD per 1M token (input/output). Aggiornare periodicamente.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini/gemini-2.5-flash-preview':    { input: 0.15,  output: 0.60  },
  'gemini/gemini-3-flash-preview':      { input: 0.075, output: 0.30  },
  'gemini/gemini-3.1-pro-preview':      { input: 1.25,  output: 5.00  },
  'gemini/gemini-2.5-flash-lite-preview': { input: 0.10, output: 0.40 },
  'openai/gpt-4o':                      { input: 2.50,  output: 10.00 },
  'openai/gpt-4o-mini':                 { input: 0.15,  output: 0.60  },
  'openai/o1-preview':                  { input: 15.00, output: 60.00 },
  'anthropic/claude-3-5-sonnet-latest': { input: 3.00,  output: 15.00 },
  'anthropic/claude-3-haiku-latest':    { input: 0.25,  output: 1.25  },
  'deepseek/deepseek-chat':             { input: 0.27,  output: 1.10  },
  'deepseek/deepseek-reasoner':         { input: 0.55,  output: 2.19  },
};

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
