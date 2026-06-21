import type { PipelineStageConfig } from './types';
import { MODEL_CATALOG } from './models/catalog';
import type { ModelProvider } from './types';

export const DEFAULT_STAGES: PipelineStageConfig[] = [
  {
    id: 'stg-translation',
    name: 'Translation',
    role: 'translation',
    prompt: 'Translate the text accurately.',
    model: 'gpt-5-nano',
    provider: 'openai',
    enabled: true,
  },
];

export const DEFAULT_JUDGE_PROMPT =
  'Audit the translation exhaustively: verify accuracy against the source sentence by sentence, glossary adherence for every glossary term, grammar, and fluency. Report every concrete issue you find, however small. For recurring issues, report each occurrence separately.';

export const DEFAULT_COHERENCE_PROMPT =
  'Check for terminology consistency, narrative continuity, and glossary adherence across segment boundaries.';

export const DEFAULT_MEMORY_EXTRACTOR_PROVIDER: ModelProvider = 'openai';
export const DEFAULT_MEMORY_EXTRACTOR_MODEL = 'gpt-5-nano';
export const DEFAULT_MEMORY_EXTRACTOR_PROMPT = `Extract phrase-memory pairs from an original source chunk and its final translation.

Return only JSON in this shape:
{"pairs":[{"sourcePhrase":"exact source text","targetPhrase":"exact target text","confidence":0.0}]}

Rules:
- sourcePhrase must be copied verbatim from the original source chunk.
- targetPhrase must be copied verbatim from the translation.
- Pair only meaningful reusable phrases, terms, idioms, names, or short clauses.
- Keep the pairs in source-text order.
- Do not invent, normalize, paraphrase, translate, or repair text.
- Use confidence from 0 to 1. Return {"pairs":[]} if no reliable pairs exist.`;

// Derived from MODEL_CATALOG — edit catalog.ts to update prices
export const MODEL_PRICING: Record<string, { input: number; output: number }> = Object.fromEntries(
  MODEL_CATALOG
    .filter((e) => e.pricing)
    .map((e) => [`${e.provider}/${e.id}`, e.pricing!]),
);

export function defaultPersonaText(source: string, target: string): string {
  return `You are an expert translator and linguist specialized in ${source} to ${target} translation.`;
}

export const DEFAULT_DEEPL_STAGE_OPTIONS = {
  modelType: 'prefer_quality_optimized' as const,
  preserveFormatting: true,
  showBilledCharacters: true,
} satisfies import('./types').DeeplConfig;

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

export const LANGUAGE_TO_DEEPL_CODE: Record<string, string> = {
  'Italian': 'IT',
  'English': 'EN',
  'French': 'FR',
  'German': 'DE',
  'Spanish': 'ES',
  'Portuguese': 'PT',
  'Dutch': 'NL',
  'Polish': 'PL',
  'Russian': 'RU',
  'Japanese': 'JA',
  'Chinese (Simplified)': 'ZH',
  'Chinese (Traditional)': 'ZH',
  'Korean': 'KO',
  'Arabic': 'AR',
  'Turkish': 'TR',
  'Swedish': 'SV',
  'Danish': 'DA',
  'Norwegian': 'NB',
  'Finnish': 'FI',
  'Czech': 'CS',
  'Slovak': 'SK',
  'Hungarian': 'HU',
  'Romanian': 'RO',
  'Bulgarian': 'BG',
  'Croatian': 'HR',
  'Slovenian': 'SL',
  'Greek': 'EL',
  'Ukrainian': 'UK',
  'Indonesian': 'ID',
  'Latvian': 'LV',
  'Lithuanian': 'LT',
  'Estonian': 'ET',
};

export function toDeeplCode(languageName: string): string {
  return LANGUAGE_TO_DEEPL_CODE[languageName] ?? languageName.slice(0, 2).toUpperCase();
}
