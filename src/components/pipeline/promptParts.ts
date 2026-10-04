import type { PipelineConfig } from '../../types';

/** Which phase a preview shows. */
export type PreviewPhase = 'translation' | 'refine' | 'format' | 'audit' | 'coherence';

/**
 * system: wording of the program, edited here behind a lock.
 * linked: its content is edited in another tab (the frame around it is still a system text).
 * auto: filled in at run time.
 */
export type PartKind = 'system' | 'linked' | 'auto';

/** Where a linked part's content is changed. */
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
  { id: 'role', message: 'system', kind: 'system' },
  { id: 'translation-context', message: 'system', kind: 'linked', place: 'general' },
  { id: 'structural-rules', message: 'system', kind: 'system' },
  // Le regole sono un testo di sistema; la tabella arriva dal dizionario assegnato.
  { id: 'glossary-rules', message: 'system', kind: 'system' },
  { id: 'markdown-rules', message: 'system', kind: 'system', absentReason: notMarkdown },
  { id: 'examples', message: 'system', kind: 'linked', place: 'memory', absentReason: noExamples },
  { id: 'neighbour-chunks', message: 'system', kind: 'auto' },
  { id: 'stage-prompt', message: 'system', kind: 'linked', place: 'stages' },
  { id: 'output-contract', message: 'system', kind: 'system' },
];

/** Every part a phase can contain, in sending order. */
export const PHASE_PARTS: Record<PreviewPhase, PartSpec[]> = {
  translation: [
    ...TRANSLATION_SYSTEM,
    { id: 'chunk-id', message: 'user', kind: 'auto' },
    { id: 'user-message', message: 'user', kind: 'system' },
  ],
  refine: [
    ...TRANSLATION_SYSTEM,
    { id: 'chunk-id', message: 'user', kind: 'auto' },
    { id: 'user-message', message: 'user', kind: 'system' },
    { id: 'audit-findings', message: 'user', kind: 'auto', absentReason: () => 'onlyRefineLoop' },
  ],
  format: [
    { id: 'role', message: 'system', kind: 'system' },
    { id: 'stage-prompt', message: 'system', kind: 'linked', place: 'stages' },
    { id: 'output-contract', message: 'system', kind: 'system' },
    { id: 'user-message', message: 'user', kind: 'system' },
  ],
  audit: [
    { id: 'role', message: 'system', kind: 'system' },
    { id: 'translation-context', message: 'system', kind: 'linked', place: 'general' },
    { id: 'stage-prompt', message: 'system', kind: 'linked', place: 'quality' },
    { id: 'glossary-table', message: 'system', kind: 'linked', place: 'glossary', absentReason: glossaryEmpty },
    { id: 'markdown-rules', message: 'system', kind: 'system', absentReason: notMarkdown },
    { id: 'review-method', message: 'system', kind: 'system' },
    { id: 'response-format', message: 'system', kind: 'system' },
    { id: 'user-message', message: 'user', kind: 'system' },
  ],
  coherence: [
    { id: 'role', message: 'system', kind: 'system' },
    { id: 'translation-context', message: 'system', kind: 'linked', place: 'general' },
    { id: 'review-method', message: 'system', kind: 'system' },
    { id: 'stage-prompt', message: 'system', kind: 'linked', place: 'quality' },
    { id: 'glossary-table', message: 'system', kind: 'linked', place: 'glossary', absentReason: glossaryEmpty },
    { id: 'response-format', message: 'system', kind: 'system' },
    { id: 'neighbour-chunks', message: 'system', kind: 'auto' },
    { id: 'chunk-id', message: 'user', kind: 'auto' },
    { id: 'user-message', message: 'user', kind: 'system' },
  ],
};

/** Parts that are always shown with placeholders but exist only in some runs. */
export const CONDITIONAL_AT_RUN_TIME: Record<string, string> = {
  'neighbour-chunks': 'whenGrouped',
  'chunk-id': 'whenGrouped',
};

/** System texts whose wording the app reads back: unlocking them asks for confirmation. */
export const GUARDED_TEXTS: ReadonlySet<string> = new Set(['audit.response-format', 'coherence.response-format']);

/** Shared system texts, used by more than one phase. */
export const SHARED_TEXTS: Record<string, string> = {
  'translation.role': 'sharedTranslationRefine',
  'translation.structural-rules': 'sharedTranslationRefine',
  'translation.glossary-rules': 'sharedTranslationRefine',
  'translation.glossary-empty': 'sharedTranslationRefine',
  'translation.markdown-rules': 'sharedTranslationRefine',
  'translation.examples': 'sharedTranslationRefine',
  'translation.neighbours': 'sharedTranslationRefine',
  'translation.stage-frame': 'sharedTranslationRefine',
  'context-frame': 'sharedAll',
  'chunk-id': 'sharedAll',
};
