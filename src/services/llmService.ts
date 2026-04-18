import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PipelineConfig, PipelineStageConfig, JudgeResult } from '../types';

interface StreamTokenPayload {
  streamId: string;
  token: string;
  done: boolean;
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
  ): Promise<string> {
    return invoke<string>('run_stage', {
      text,
      stage,
      config,
      previousResult: previousResult || null,
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
  ): Promise<string> {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId === streamId && !event.payload.done) {
        onToken(event.payload.token);
      }
    });

    try {
      const result = await invoke<string>('run_stage_stream', {
        text,
        stage,
        config,
        previousResult: previousResult || null,
        streamId,
      });
      return result;
    } finally {
      unlisten();
    }
  },

  async judgeTranslation(
    originalText: string,
    translation: string,
    config: PipelineConfig,
  ): Promise<Omit<JudgeResult, 'status'>> {
    return invoke<Omit<JudgeResult, 'status'>>('judge_translation', {
      originalText,
      translation,
      config,
    });
  },

  async optimizePrompt(currentPrompt: string): Promise<string> {
    return invoke<string>('optimize_prompt', { currentPrompt });
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

/**
 * Settings service for API key management via OS Keychain.
 */
export const settingsService = {
  async saveApiKey(provider: string, key: string): Promise<void> {
    return invoke('save_api_key', { provider, key });
  },

  async deleteApiKey(provider: string): Promise<void> {
    return invoke('delete_api_key', { provider });
  },

  async isKeyConfigured(provider: string): Promise<boolean> {
    return invoke<boolean>('get_api_key_status', { provider });
  },
};
