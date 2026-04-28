export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'ollama';
export type QualityRating = 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
export type ChunkStatus = 'ready' | 'processing' | 'completed' | 'error';
export type ViewMode = 'sandbox' | 'document';
export type DocumentLayoutPreference = 'auto' | 'standard' | 'book';
export type OllamaStatus = 'unknown' | 'connected' | 'disconnected';

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
  prompt: string;
  model: string;
  provider: ModelProvider;
  enabled: boolean;
}

export interface TranslationChunk {
  id: string;
  originalText: string;
  status: ChunkStatus;
  stageResults: Record<string, PipelineResult>; // Key is stage id
  judgeResult: JudgeResult;
  currentDraft?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  context: 'stage' | 'audit';
  defaultModel?: string;
  defaultProvider?: string;
  createdAt: string;
}

export interface PipelineResult {
  content: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  error?: string;
  tokenUsage?: TokenUsage;
}

export interface JudgeResult extends PipelineResult {
  rating: QualityRating;
  issues: Issue[];
}

export interface Issue {
  type: 'glossary' | 'fluency' | 'accuracy' | 'grammar';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedFix?: string;
}

export interface PipelineConfig {
  sourceLanguage: string;
  targetLanguage: string;
  stages: PipelineStageConfig[];
  judgePrompt: string;
  judgeModel: string;
  judgeProvider: ModelProvider;
  glossary: GlossaryEntry[];
  assignedGlossaryId?: string | null;
  useChunking?: boolean;
  targetChunkCount?: number;
}
