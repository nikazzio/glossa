import type { PipelineConfig } from '../../types';

/** Which phase a preview shows. */
export type PreviewPhase = 'translation' | 'refine' | 'format' | 'audit' | 'coherence';

/** Fixed: written in the program. Yours: a text you write. Data: comes from resources you manage. Auto: filled in at run time. */
export type PartKind = 'fixed' | 'yours' | 'data' | 'auto';

/** Where a part is changed, when it can be. */
export type PartPlace = 'general' | 'stages' | 'quality' | 'glossary' | 'memory';

export interface PartSpec {
  id: string;
  message: 'system' | 'user';
  kind: PartKind;
  place?: PartPlace;
  /** Present only in some cases: the reason it is missing, given the configuration, or null when present. */
  absentReason?: (config: PipelineConfig) => string | null;
}

const glossaryEmpty = (config: PipelineConfig) => (config.glossary.length === 0 ? 'noGlossary' : null);
const notMarkdown = (config: PipelineConfig) => (config.markdownAware ? null : 'notMarkdown');
const noExamples = (config: PipelineConfig) => ((config.fewShotExamples ?? []).length === 0 ? 'noExamples' : null);

const TRANSLATION_SYSTEM: PartSpec[] = [
  { id: 'role', message: 'system', kind: 'fixed' },
  { id: 'translation-context', message: 'system', kind: 'yours', place: 'general' },
  { id: 'structural-rules', message: 'system', kind: 'fixed' },
  { id: 'glossary-rules', message: 'system', kind: 'data', place: 'glossary' },
  { id: 'markdown-rules', message: 'system', kind: 'fixed', absentReason: notMarkdown },
  { id: 'examples', message: 'system', kind: 'data', place: 'memory', absentReason: noExamples },
  { id: 'neighbour-chunks', message: 'system', kind: 'auto', place: 'stages' },
  { id: 'stage-prompt', message: 'system', kind: 'yours', place: 'stages' },
  { id: 'output-contract', message: 'system', kind: 'fixed' },
];

/** Every part a phase can contain, in sending order. */
export const PHASE_PARTS: Record<PreviewPhase, PartSpec[]> = {
  translation: [
    ...TRANSLATION_SYSTEM,
    { id: 'chunk-id', message: 'user', kind: 'auto' },
    { id: 'chunk-text', message: 'user', kind: 'auto' },
    { id: 'task', message: 'user', kind: 'fixed' },
  ],
  refine: [
    ...TRANSLATION_SYSTEM,
    { id: 'chunk-id', message: 'user', kind: 'auto' },
    { id: 'chunk-text', message: 'user', kind: 'auto' },
    { id: 'previous-result', message: 'user', kind: 'auto' },
    { id: 'task', message: 'user', kind: 'fixed' },
    { id: 'audit-findings', message: 'user', kind: 'auto', absentReason: () => 'onlyRefineLoop' },
  ],
  format: [
    { id: 'role', message: 'system', kind: 'fixed' },
    { id: 'stage-prompt', message: 'system', kind: 'yours', place: 'stages' },
    { id: 'output-contract', message: 'system', kind: 'fixed' },
    { id: 'chunk-text', message: 'user', kind: 'auto' },
    { id: 'task', message: 'user', kind: 'fixed' },
  ],
  audit: [
    { id: 'role', message: 'system', kind: 'fixed' },
    { id: 'translation-context', message: 'system', kind: 'yours', place: 'general' },
    { id: 'stage-prompt', message: 'system', kind: 'yours', place: 'quality' },
    { id: 'glossary-table', message: 'system', kind: 'data', place: 'glossary', absentReason: glossaryEmpty },
    { id: 'markdown-rules', message: 'system', kind: 'fixed', absentReason: notMarkdown },
    { id: 'review-method', message: 'system', kind: 'fixed' },
    { id: 'response-format', message: 'system', kind: 'fixed' },
    { id: 'chunk-text', message: 'user', kind: 'auto' },
    { id: 'translation', message: 'user', kind: 'auto' },
    { id: 'task', message: 'user', kind: 'fixed' },
  ],
  coherence: [
    { id: 'role', message: 'system', kind: 'fixed' },
    { id: 'translation-context', message: 'system', kind: 'yours', place: 'general' },
    { id: 'review-method', message: 'system', kind: 'fixed' },
    { id: 'stage-prompt', message: 'system', kind: 'yours', place: 'quality' },
    { id: 'glossary-table', message: 'system', kind: 'data', place: 'glossary', absentReason: glossaryEmpty },
    { id: 'response-format', message: 'system', kind: 'fixed' },
    { id: 'neighbour-chunks', message: 'system', kind: 'auto' },
    { id: 'chunk-id', message: 'user', kind: 'auto' },
    { id: 'chunk-text', message: 'user', kind: 'auto' },
    { id: 'translation', message: 'user', kind: 'auto' },
    { id: 'task', message: 'user', kind: 'fixed' },
  ],
};

/** Parts that are always shown with placeholders but exist only in some runs. */
export const CONDITIONAL_AT_RUN_TIME: Record<string, string> = {
  'neighbour-chunks': 'whenGrouped',
  'chunk-id': 'whenGrouped',
};
