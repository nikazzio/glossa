export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'ollama';
export type QualityRating = 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
export type ChunkStatus = 'ready' | 'processing' | 'completed' | 'error';
export type ViewMode = 'sandbox' | 'document';
export type DocumentLayoutPreference = 'auto' | 'standard' | 'book';
export type OllamaStatus = 'unknown' | 'connected' | 'disconnected';
export type DocumentFormat = 'plain' | 'markdown';
export type DocumentRenderProfile = 'plain-text' | 'markdown';
export type ExperimentalImportMode = 'docx-markdown';
export type OllamaThinkLevel = boolean | 'low' | 'medium' | 'high';
export type StageRole = 'translation' | 'refine' | 'format';
export type PipelineMode = 'standard' | 'editorial';

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
}

export interface GeminiCacheConfig {
  explicitCaching?: boolean;
  cacheTtlSeconds?: number;
}

export interface ProviderRuntimeConfig {
  ollama?: OllamaConfig;
  openai?: OpenAICacheConfig;
  deepseek?: OpenAICacheConfig;
  gemini?: GeminiCacheConfig;
}

export interface GlossaryEntry {
  id?: string;
  term: string;
  translation: string;
  notes?: string;
}

export interface Glossary {
  id: string;
  name: string;
  description?: string;
  sourceLanguage: string;
  targetLanguage: string;
  createdAt: string;
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
  // Legacy mirrors kept temporarily while the UI finishes migrating.
  originalText: string;
  status: ChunkStatus;
  stageResults: Record<string, PipelineResult>;
  judgeResult: JudgeResult;
  coherenceResult?: CoherenceResult;
  currentDraft?: string;
  translationLocked?: boolean;
  translationStale?: boolean;
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

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  context: 'stage' | 'audit' | 'persona';
  defaultModel?: string;
  defaultProvider?: string;
  createdAt: string;
}

export interface PipelineResult {
  content: string;
  status: 'idle' | 'processing' | 'completed' | 'error' | 'retrying';
  error?: string;
  tokenUsage?: TokenUsage;
  promptInfo?: PromptInfo;
  retryInfo?: { attempt: number; total: number; delayMs: number };
}

export interface JudgeResult extends PipelineResult {
  rating: QualityRating;
  issues: Issue[];
}

export interface Issue {
  type: 'glossary' | 'fluency' | 'accuracy' | 'grammar' | 'consistency';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedFix?: string;
}

export interface CoherenceResult {
  status: 'idle' | 'processing' | 'completed' | 'error';
  issues: Issue[];
  error?: string;
  tokenUsage?: TokenUsage;
  promptInfo?: PromptInfo;
}

export interface PipelineConfig {
  sourceLanguage: string;
  targetLanguage: string;
  mode?: PipelineMode;
  stages: PipelineStageConfig[];
  judgePrompt: string;
  judgeModel: string;
  judgeProvider: ModelProvider;
  glossary: GlossaryEntry[];
  assignedGlossaryId?: string | null;
  useChunking?: boolean;
  targetChunkCount?: number;
  minWords?: number;
  maxWords?: number;
  headingAware?: boolean;
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
  // Runtime-only prompt context. Computed per invocation, never persisted.
  blobContext?: string;
  blobCurrentChunkId?: string;
}
