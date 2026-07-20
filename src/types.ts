export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom' | 'deepl';

export interface CustomProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
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
export type ViewMode = 'sandbox' | 'document';
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
