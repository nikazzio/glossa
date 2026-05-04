import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PipelineConfig, PipelineStageConfig, JudgeResult, Issue, TokenUsage } from '../types';
import { useChunksStore } from '../stores/chunksStore';

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

    useChunksStore.getState().setActiveStreamId(streamId);
    try {
      const result = await invoke<string>('run_stage_stream', {
        text,
        stage,
        config,
        previousResult: previousResult || null,
        previousTranslation: previousTranslation || null,
        streamId,
      });
      return result;
    } finally {
      unlisten();
      useChunksStore.getState().setActiveStreamId(null);
    }
  },

  async cancelStream(streamId: string): Promise<void> {
    return invoke('cancel_stream', { streamId });
  },

  async judgeTranslation(
    originalText: string,
    translation: string,
    config: PipelineConfig,
  ): Promise<Omit<JudgeResult, 'status'> & { inputTokens?: number; outputTokens?: number }> {
    return invoke<Omit<JudgeResult, 'status'> & { inputTokens?: number; outputTokens?: number }>(
      'judge_translation',
      { originalText, translation, config },
    );
  },

  async runCoherenceForChunk(
    input: { original: string; translation: string; prevContext?: string; nextContext?: string },
    config: PipelineConfig,
  ): Promise<{ issues: Issue[]; inputTokens?: number; outputTokens?: number }> {
    return invoke('run_coherence_for_chunk', { input, config });
  },

  async refinePrompt(
    prompt: string,
    provider: string,
    model: string,
    context: 'stage' | 'audit',
  ): Promise<string> {
    return invoke<string>('refine_prompt', { prompt, provider, model, context });
  },

  async testConnection(provider: string): Promise<boolean> {
    return invoke<boolean>('test_provider_connection', { provider });
  },
};

/**
 * Ollama service for local model management.
 */
export const ollamaService = {
  async listModels(): Promise<string[]> {
    return invoke<string[]>('list_ollama_models');
  },

  async checkStatus(): Promise<boolean> {
    return invoke<boolean>('check_ollama_status');
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
