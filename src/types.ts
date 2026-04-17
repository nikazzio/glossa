export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek';

export interface GlossaryEntry {
  term: string;
  translation: string;
  notes?: string;
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
  stageResults: Record<string, PipelineResult>; // Key is stage id
  judgeResult: JudgeResult;
}

export interface PipelineResult {
  content: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface JudgeResult extends PipelineResult {
  score: number; // 0-10
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
}
