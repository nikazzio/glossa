import { invoke } from '@tauri-apps/api/core';
import type { PipelineConfig, PipelineStageConfig, JudgeResult } from '../types';

/**
 * LLM Service — delegates all AI calls to the Tauri Rust backend.
 * API keys are stored securely in the OS-level store, never in the browser.
 */
export const llmService = {
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
 * Settings service for API key management via Tauri store.
 */
export const settingsService = {
  async saveApiKey(provider: string, key: string): Promise<void> {
    return invoke('save_api_key', { provider, key });
  },

  async isKeyConfigured(provider: string): Promise<boolean> {
    return invoke<boolean>('get_api_key_status', { provider });
  },
};
