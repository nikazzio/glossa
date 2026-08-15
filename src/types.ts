import type { WorkspaceIconKey } from './workspaceIdentity';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom' | 'deepl';

export interface CustomProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
}

export type IIIFSearchMode = 'direct' | 'fallback' | 'search_first';

export interface IIIFProviderFilterOption {
  value: string;
}

export interface IIIFProviderFilter {
  key: string;
  options: IIIFProviderFilterOption[];
}

export interface IIIFProvider {
  key: string;
  label: string;
  aliases: string[];
  placeholder: string;
  isEnabled: boolean;
  resolver: string;
  searchHandler: string | null;
  searchMode: IIIFSearchMode;
  supportsDirectResolution: boolean;
  supportsSearch: boolean;
  filters: IIIFProviderFilter[];
}

export type IIIFDiscoveryStatus = 'manifest' | 'results' | 'not_found';

export interface IIIFManifestPreview {
  manifestUrl: string;
  title: string;
  creator: string | null;
  date: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  language: string | null;
  volume: string | null;
  subjects: string[];
  itemCount: number | null;
  materialType: string | null;
}

export interface IIIFDiscoveryResult {
  id: string;
  title: string;
  creator: string | null;
  date: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  collection: string | null;
  language: string | null;
  volume: string | null;
  subjects: string[];
  manifestUrl: string;
}

export type SourceCard = IIIFDiscoveryResult | (IIIFManifestPreview & { id: string });

export function isManifest(card: SourceCard): card is IIIFManifestPreview & { id: string } {
  return 'itemCount' in card;
}

/** Tentativo automatico (best-effort) di riconoscere il tipo materiale dai metadati
 * disponibili. Se nessuna parola chiave nota è presente, resta 'iiif' — mai bloccante,
 * sempre correggibile a mano quando la gestione manuale sarà disponibile (#398). */
export function classifySourceKind(card: SourceCard): SourceKind {
  const haystack = [
    isManifest(card) ? card.materialType : card.mediaType,
    isManifest(card) ? null : card.collection,
    card.subjects.join(' '),
  ].filter((value): value is string => Boolean(value)).join(' ').toLowerCase();

  if (/manuscript|manoscritt/.test(haystack)) return 'manuscript';
  if (/\bpdf\b/.test(haystack)) return 'pdf';
  if (/print|stamp|incunab|imprint/.test(haystack)) return 'print';
  return 'iiif';
}

export interface IIIFDiscoveryOutcome {
  status: IIIFDiscoveryStatus;
  providerKey: string;
  manifest: IIIFManifestPreview | null;
  results: IIIFDiscoveryResult[];
  hasMore: boolean;
}

export type SourceKind = 'manuscript' | 'print' | 'pdf' | 'iiif' | 'web' | 'other';

export interface AddSourceToLibraryInput {
  manifestUrl: string;
  title: string;
  description: string | null;
  kind: SourceKind;
  creator: string | null;
  date: string | null;
  thumbnailUrl: string | null;
  language: string | null;
  subjects: string[];
  /** Da quale biblioteca viene: è un fatto che non cambia mai (D2). */
  providerKey: string | null;
  /** Identificativo dell'opera presso quella biblioteca. */
  externalId: string | null;
  mediaType: string | null;
  materialType: string | null;
  collection: string | null;
  volume: string | null;
  /** Carte dichiarate dal manifesto, quando la ricerca le ha già lette. */
  itemCount: number | null;
  workspaceId?: string;
}

export interface LibrarySource {
  id: string;
  title: string;
  kind: SourceKind;
  primaryLanguage: string | null;
  externalRef: string | null;
  createdAt: string;
}

/** Una riga del catalogo della Biblioteca: la fonte più ciò che serve a
 *  mostrarla senza aprirla. */
export interface LibraryCatalogEntry {
  source: LibrarySource;
  versionId: string | null;
  manifestUrl: string | null;
  thumbnailUrl: string | null;
  creator: string | null;
  date: string | null;
  /** Carte dichiarate dal manifesto, quando si è già letto. */
  expectedPages: number | null;
  /** Carte davvero presenti sul computer. */
  localPages: number;
  /** Quanto occupano quelle carte: serve alla conferma di «libera spazio» (D6). */
  localBytes: number;
  /**
   * Chiave della biblioteca nel registro dei provider: decide il profilo di rete
   * dello scaricamento (D18) e la cartella nel deposito (D2).
   */
  providerKey: string | null;
}

export interface LibrarySourceVersion {
  id: string;
  sourceId: string;
  label: string;
  versionKind: 'iiif_manifest' | 'pdf' | 'edition' | 'copy' | 'other';
  sourceUrl: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface LibraryAsset {
  id: string;
  sourceVersionId: string | null;
  kind: 'image' | 'pdf' | 'manifest' | 'thumbnail' | 'derived' | 'other';
  locality: 'remote' | 'local' | 'derived';
  availability: 'catalogued' | 'partial' | 'complete';
  remoteUrl: string | null;
}

export interface LibrarySourceDetail {
  source: LibrarySource;
  versions: LibrarySourceVersion[];
  assets: LibraryAsset[];
  linkedWorkspaceIds: string[];
}

export type AnnotationType = 'comment' | 'doubt' | 'problem' | 'approved';

export interface Annotation {
  id: string;
  chunkId: string;
  pipelineId: string;
  type: AnnotationType;
  content: string;
  anchorText?: string | null;
  sequence: number;
  createdAt: string;
}
export type ModelReasoningClass = 'reasoning' | 'non_reasoning' | 'optional';
export type ModelStatus = 'stable' | 'preview' | 'deprecated';
export type QualityRating = 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
export type ChunkStatus = 'ready' | 'processing' | 'completed' | 'error';
export type DocumentLayoutPreference = 'auto' | 'standard' | 'book';
export type OllamaStatus = 'unknown' | 'connected' | 'disconnected';
export type DocumentFormat = 'plain' | 'markdown';
export type DocumentRenderProfile = 'plain-text' | 'markdown';
export type ExperimentalImportMode = 'docx-markdown';
export type OllamaThinkLevel = boolean | 'low' | 'medium' | 'high';
export type ReasoningEffortLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
export type StageRole = 'translation' | 'refine' | 'format' | 'deepl-translation';
export type PipelineMode = 'standard' | 'editorial' | 'deepl-hybrid';
export type PipelineRunStatus = 'idle' | 'running' | 'completed' | 'interrupted';

/** A translation pipeline entity as stored in the DB. */
export interface Pipeline {
  id: string;
  projectId: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  mode: PipelineMode;
  runStatus: PipelineRunStatus;
  lastRunConfig: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OllamaConfig {
  temperature?: number;
  topP?: number;
  seed?: number | null;
  keepAlive?: string | number;
  think?: OllamaThinkLevel;
  numCtx?: number | null;
  numPredict?: number | null;
  useAdvancedOptions?: boolean;
  advancedOptions?: Record<string, unknown>;
}

export interface OpenAICacheConfig {
  promptCacheKey?: string;
  promptCacheRetention?: 'in_memory' | '24h';
  reasoningEffort?: ReasoningEffortLevel;
  /** 0.0-2.0. Only applied when reasoning is effectively off (GPT-5.x rejects it while reasoning). */
  temperature?: number;
}

export interface DeepSeekConfig {
  reasoningEffort?: ReasoningEffortLevel;
  /** 0.0-2.0. Ignored (no-op, no error) while DeepSeek-v4 thinking mode is active. */
  temperature?: number;
}

export interface GeminiCacheConfig {
  explicitCaching?: boolean;
  cacheTtlSeconds?: number;
  thinkingBudget?: number | null; // 0 = disabled, null = provider default
  /** 0.0-2.0. Coexists with thinkingBudget without conflict on Gemini's API. */
  temperature?: number;
}

export interface DeeplConfig {
  modelType?: 'latency_optimized' | 'quality_optimized' | 'prefer_quality_optimized';
  formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
  context?: string;
  preserveFormatting?: boolean;
  glossaryId?: string;
  showBilledCharacters?: boolean;
}

export interface DeeplLanguageInfo {
  language: string;
  name: string;
  supportsFormality?: boolean;
}

export interface AnthropicConfig {
  /** 0.0-1.0. The UI always resolves this to a concrete value (default 0) once the control renders. */
  temperature?: number;
  /** Opt-in, off by default: attach cache_control to cacheable blocks. Off by
   * default because Anthropic caching (unlike OpenAI/Gemini/DeepSeek) costs a
   * write premium with no benefit unless chunks are worked through close together. */
  enableCaching?: boolean;
  /** Only meaningful when enableCaching is true: use the 1-hour TTL instead of
   * the 5-minute default (2x write cost instead of 1.25x). */
  extendedCacheTtl?: boolean;
}

export interface ProviderRuntimeConfig {
  ollama?: OllamaConfig;
  openai?: OpenAICacheConfig;
  deepseek?: DeepSeekConfig;
  gemini?: GeminiCacheConfig;
  deepl?: DeeplConfig;
  anthropic?: AnthropicConfig;
}

export interface GlossaryEntry {
  id?: string;
  term: string;
  translation: string;
  notes?: string;
}

// A hand-picked, already-approved chunk translation used as a few-shot style
// example. Folded into the cacheable static block (unlike Phrase Memory,
// which is per-chunk and lives in the non-cacheable stage-instructions block).
export interface FewShotExample {
  id: string;
  sourceChunkId?: string;
  sourceText: string;
  targetText: string;
  label?: string;
}

export interface Glossary {
  id: string;
  name: string;
  description?: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
  workspaceId?: string;
}

export interface PipelineStageConfig {
  id: string;
  name: string;
  role?: StageRole;
  prompt: string;
  model: string;
  provider: ModelProvider;
  enabled: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  providerOptions?: ProviderRuntimeConfig;
  customProviderId?: string;
}

export interface Footnote {
  id: string;
  marker: string;
  text: string;
}

export interface FootnoteDefinition {
  id: string;
  text: string;
}

export interface TranslationChunk {
  id: string;
  sourceDisplayText: string;
  sourceProcessingText: string;
  translationDisplayText: string;
  translationProcessingText: string;
  status: ChunkStatus;
  stageResults: Record<string, PipelineResult>;
  judgeResult: JudgeResult;
  coherenceResult?: CoherenceResult;
  translationLocked?: boolean;
  translationStale?: boolean;
  sourceEditable?: boolean;
  footnotes?: Footnote[];
  blobId?: string;
  blobOrder?: number;
  blobReferenceChunkIds?: string[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheMissInputTokens?: number;
}

export interface PromptInfo {
  systemPrompt: string;
  userPrompt: string;
}

export interface ResponseInfo {
  kind: 'judge' | 'coherence';
  rawJson: string;
}

export type PromptTemplateContext = 'stage' | 'audit' | 'persona' | 'memory';
export type PromptTemplateWorkflow = 'translation' | 'transcription';

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  context: PromptTemplateContext;
  workflow: PromptTemplateWorkflow;
  defaultModel?: string;
  defaultProvider?: string;
  createdAt: string;
}

export interface PipelineResult {
  content: string;
  status: 'idle' | 'processing' | 'completed' | 'error' | 'retrying';
  error?: string;
  tokenUsage?: TokenUsage;
  billedCharacters?: number;
  promptInfo?: PromptInfo;
  retryInfo?: { attempt: number; total: number; delayMs: number };
}

export interface JudgeResult extends PipelineResult {
  rating: QualityRating;
  issues: Issue[];
  // Self-verification list from the judge model (1-based sentence indices it scanned). Not displayed in UI.
  checkedSentenceIndices?: number[];
}

export interface Issue {
  type: 'glossary' | 'fluency' | 'accuracy' | 'grammar' | 'consistency';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedFix?: string;
  phrase?: string;
  sourcePhrase?: string;
  confidence?: number;
  resolved?: boolean;
  rejected?: boolean;
}

export interface CoherenceResult {
  status: 'idle' | 'processing' | 'completed' | 'error';
  issues: Issue[];
  error?: string;
  tokenUsage?: TokenUsage;
  promptInfo?: PromptInfo;
}

export interface PipelineConfig {
  pipelineId: string;
  sourceLanguage: string;
  targetLanguage: string;
  mode?: PipelineMode;
  stages: PipelineStageConfig[];
  judgePrompt: string;
  judgeModel: string;
  judgeProvider: ModelProvider;
  glossary: GlossaryEntry[];
  assignedGlossaryId?: string | null;
  fewShotExamples?: FewShotExample[];
  useChunking?: boolean;
  wordsPerChunk?: number;
  minWords?: number;
  maxWords?: number;
  headingAware?: boolean;
  carryTrailingShortBlocks?: boolean;
  documentFormat?: DocumentFormat;
  renderProfile?: DocumentRenderProfile;
  markdownAware?: boolean;
  experimentalImport?: ExperimentalImportMode | null;
  coherencePrompt?: string;
  reviewProviderOptions?: ProviderRuntimeConfig;
  persona?: string;
  uiLanguage?: string;
  customSourceLanguage?: string;
  customTargetLanguage?: string;
  blobBudgetTokens?: number;
  blobOverlap?: number;
  chunkedWithContextWindow?: number;
  usePhraseMemory?: boolean;
  autoSearchPhraseMemory?: boolean;
  phraseMemorySimilarityThreshold?: number;
  phraseMemoryMaxResults?: number;
  // Runtime-only prompt context. Computed per invocation, never persisted.
  blobContext?: string;
  blobCurrentChunkId?: string;
  judgeRefineLoop?: boolean;
  judgeRefineLoopMaxIter?: number;
}

// ── Phrase Memory ────────────────────────────────────────────────────

export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large';

export type Workspace = {
  id: string;
  name: string;
  /** Preset-only for now; future custom identities need a distinct type. */
  iconKey: WorkspaceIconKey;
  description?: string;
  embeddingModel: EmbeddingModel;
  memoryExtractorProvider: ModelProvider;
  memoryExtractorModel: string;
  memoryExtractorPrompt: string;
  createdAt: string;
};

export type PhraseMatch = {
  phraseMemoryId: string;
  sourcePhrase: string;
  targetPhrase: string;
  distance: number;
  confidence: number;
};

export type EmbeddingJobStatus =
  | { kind: 'idle' }
  | { kind: 'running'; chunkId: string | null; processed: number; total: number; estimatedCostUsd: number }
  | { kind: 'done'; totalPhrases: number }
  | { kind: 'error'; message: string };
