import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import i18n from 'i18next';
import type { PipelineConfig, PipelineStageConfig, JudgeResult, Issue, TokenUsage, PromptInfo } from '../types';
import { useChunksStore } from '../stores/chunksStore';
import { logOperation } from '../stores/operationLogStore';

const LOCALE_NAMES: Record<string, string> = {
  it: 'Italian',
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

function withUiLanguage(config: PipelineConfig): PipelineConfig {
  const locale = i18n.language ?? 'en';
  const lang = LOCALE_NAMES[locale] ?? LOCALE_NAMES[locale.split('-')[0]] ?? 'English';
  return { ...config, uiLanguage: lang };
}

/// Sentinel string returned by the Rust backend when a stream is
/// cancelled via cancel_stream. Exposed so the pipeline runner can
/// suppress the error toast for user-initiated cancels.
export const STREAM_CANCELLED_ERROR = 'Stream cancelled';

export function isStreamCancelledError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(STREAM_CANCELLED_ERROR);
}

interface StreamTokenPayload {
  streamId: string;
  token: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface OllamaPreflightStatus {
  reachable: boolean;
  models: string[];
  requestedModel?: string | null;
  modelAvailable: boolean;
}

export interface PreflightCheckResult {
  provider: string;
  model: string;
  label: string;
  ok: boolean;
  error?: string;
  /** Populated for Ollama only — the full list of locally-installed models. */
  availableModels?: string[];
}

/**
 * LLM Service — delegates all AI calls to the Tauri Rust backend.
 * API keys are stored securely in the OS-level store, never in the browser.
 */
export const llmService = {
  /** Non-streaming stage execution (fallback) */
  async runStage(
    text: string,
    stage: PipelineStageConfig,
    config: PipelineConfig,
    previousResult?: string,
    previousTranslation?: string,
  ): Promise<string> {
    logOperation({
      level: 'info',
      scope: 'invoke',
      message: `Invoking backend stage run for ${stage.provider}/${stage.model}`,
      stageId: stage.id,
    });
    return invoke<string>('run_stage', {
      text,
      stage,
      config,
      previousResult: previousResult || null,
      previousTranslation: previousTranslation || null,
    });
  },

  /**
   * Streaming stage execution — sets up event listener, invokes backend,
   * calls onToken for each token, cleans up listener, returns full text.
   */
  async runStageStream(
    text: string,
    stage: PipelineStageConfig,
    config: PipelineConfig,
    previousResult: string | undefined,
    onToken: (token: string) => void,
    onUsage?: (usage: TokenUsage) => void,
    previousTranslation?: string,
    onPrompt?: (info: PromptInfo) => void,
    onIdleGrace?: () => void,
  ): Promise<string> {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId !== streamId) return;
      if (!event.payload.done) {
        onToken(event.payload.token);
      } else if (
        onUsage &&
        event.payload.inputTokens !== undefined &&
        event.payload.outputTokens !== undefined
      ) {
        onUsage({ inputTokens: event.payload.inputTokens, outputTokens: event.payload.outputTokens });
      }
    });
    const unlistenPrompt = await listen<{ streamId: string; systemPrompt: string; userPrompt: string }>('chunk-prompt', (event) => {
      if (event.payload.streamId !== streamId) return;
      onPrompt?.({ systemPrompt: event.payload.systemPrompt, userPrompt: event.payload.userPrompt });
    });
    const unlistenAlive = await listen<{ streamId: string }>('stream-alive', (event) => {
      if (event.payload.streamId !== streamId) return;
      onIdleGrace?.();
    });

    useChunksStore.getState().setActiveStreamId(streamId);
    try {
      return await invoke<string>('run_stage_stream', {
        text,
        stage,
        config,
        previousResult: previousResult || null,
        previousTranslation: previousTranslation || null,
        streamId,
      });
    } finally {
      unlisten();
      unlistenPrompt();
      unlistenAlive();
      useChunksStore.getState().setActiveStreamId(null);
    }
  },

  async cancelStream(streamId: string): Promise<void> {
    logOperation({
      level: 'warn',
      scope: 'invoke',
      message: 'Invoking backend stream cancellation',
      meta: { streamId },
    });
    return invoke('cancel_stream', { streamId });
  },

  async judgeTranslation(
    originalText: string,
    translation: string,
    config: PipelineConfig,
    onPrompt?: (info: PromptInfo) => void,
    onIdleGrace?: () => void,
  ): Promise<Omit<JudgeResult, 'status'> & { inputTokens?: number; outputTokens?: number }> {
    const streamId = `judge-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let capturedUsage: TokenUsage | undefined;
    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId !== streamId) return;
      if (
        event.payload.done &&
        event.payload.inputTokens !== undefined &&
        event.payload.outputTokens !== undefined
      ) {
        capturedUsage = { inputTokens: event.payload.inputTokens, outputTokens: event.payload.outputTokens };
      }
    });
    const unlistenPrompt = await listen<{ streamId: string; systemPrompt: string; userPrompt: string }>('chunk-prompt', (event) => {
      if (event.payload.streamId !== streamId) return;
      onPrompt?.({ systemPrompt: event.payload.systemPrompt, userPrompt: event.payload.userPrompt });
    });
    const unlistenAlive = await listen<{ streamId: string }>('stream-alive', (event) => {
      if (event.payload.streamId !== streamId) return;
      onIdleGrace?.();
    });

    useChunksStore.getState().setActiveStreamId(streamId);
    try {
      const result = await invoke<Omit<JudgeResult, 'status'> & { inputTokens?: number; outputTokens?: number }>(
        'judge_translation',
        { originalText, translation, config: withUiLanguage(config), streamId },
      );
      return {
        ...result,
        inputTokens: capturedUsage?.inputTokens,
        outputTokens: capturedUsage?.outputTokens,
      };
    } finally {
      unlisten();
      unlistenPrompt();
      unlistenAlive();
      useChunksStore.getState().setActiveStreamId(null);
    }
  },

  async runCoherenceForChunk(
    input: { original: string; translation: string; prevContext?: string; nextContext?: string },
    config: PipelineConfig,
    onPrompt?: (info: PromptInfo) => void,
    onIdleGrace?: () => void,
  ): Promise<{ issues: Issue[]; inputTokens?: number; outputTokens?: number }> {
    const streamId = `coherence-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let capturedUsage: TokenUsage | undefined;
    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId !== streamId) return;
      if (
        event.payload.done &&
        event.payload.inputTokens !== undefined &&
        event.payload.outputTokens !== undefined
      ) {
        capturedUsage = { inputTokens: event.payload.inputTokens, outputTokens: event.payload.outputTokens };
      }
    });
    const unlistenPrompt = await listen<{ streamId: string; systemPrompt: string; userPrompt: string }>('chunk-prompt', (event) => {
      if (event.payload.streamId !== streamId) return;
      onPrompt?.({ systemPrompt: event.payload.systemPrompt, userPrompt: event.payload.userPrompt });
    });
    const unlistenAlive = await listen<{ streamId: string }>('stream-alive', (event) => {
      if (event.payload.streamId !== streamId) return;
      onIdleGrace?.();
    });

    useChunksStore.getState().setActiveStreamId(streamId);
    try {
      const result = await invoke<{ issues: Issue[]; inputTokens?: number; outputTokens?: number }>(
        'run_coherence_for_chunk',
        { input, config: withUiLanguage(config), streamId },
      );
      return {
        ...result,
        inputTokens: capturedUsage?.inputTokens,
        outputTokens: capturedUsage?.outputTokens,
      };
    } finally {
      unlisten();
      unlistenPrompt();
      unlistenAlive();
      useChunksStore.getState().setActiveStreamId(null);
    }
  },

  async refinePrompt(
    prompt: string,
    provider: string,
    model: string,
    context: 'stage' | 'audit' | 'persona',
  ): Promise<string> {
    return invoke<string>('refine_prompt', { prompt, provider, model, context });
  },

  async testConnection(provider: string): Promise<boolean> {
    return invoke<boolean>('test_provider_connection', { provider });
  },

  /** Run pre-flight checks for the given (provider, model, label) entries. */
  async preflightPipeline(
    checks: Array<{ provider: string; model: string; label: string }>,
  ): Promise<PreflightCheckResult[]> {
    return invoke<PreflightCheckResult[]>('preflight_pipeline', { checks });
  },
};

/**
 * Ollama service for local model management.
 */
export const ollamaService = {
  async listModels(): Promise<string[]> {
    logOperation({ level: 'info', scope: 'invoke', message: 'Invoking backend model listing for Ollama' });
    return invoke<string[]>('list_ollama_models');
  },

  async checkStatus(): Promise<boolean> {
    logOperation({ level: 'info', scope: 'invoke', message: 'Invoking backend reachability check for Ollama' });
    return invoke<boolean>('check_ollama_status');
  },

  async checkPreflight(model?: string): Promise<OllamaPreflightStatus> {
    logOperation({
      level: 'info',
      scope: 'invoke',
      message: 'Invoking backend preflight check for Ollama',
      meta: model ? { model } : undefined,
    });
    return invoke<OllamaPreflightStatus>('check_ollama_preflight', {
      model: model ?? null,
    });
  },
};

export type ApiKeyStorage = 'keychain' | 'file';

/**
 * Settings service for API key management via OS keychain with local-file fallback.
 */
export const settingsService = {
  async saveApiKey(provider: string, key: string): Promise<ApiKeyStorage> {
    return invoke<ApiKeyStorage>('save_api_key', { provider, key });
  },

  async deleteApiKey(provider: string): Promise<void> {
    return invoke('delete_api_key', { provider });
  },

  async isKeyConfigured(provider: string): Promise<boolean> {
    return invoke<boolean>('get_api_key_status', { provider });
  },
};
