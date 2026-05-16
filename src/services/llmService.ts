import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import i18n from 'i18next';
import type {
  DiscoveredProviderModel,
  PipelineConfig,
  PipelineStageConfig,
  JudgeResult,
  Issue,
  TokenUsage,
  PromptInfo,
  ResponseInfo,
} from '../types';
import { useChunksStore } from '../stores/chunksStore';
import { useUiStore } from '../stores/uiStore';
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
  cachedInputTokens?: number;
  cacheMissInputTokens?: number;
}

interface UsageResult {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheMissInputTokens?: number;
}

function usageFromPayload(payload: StreamTokenPayload): TokenUsage | undefined {
  if (payload.inputTokens === undefined || payload.outputTokens === undefined) return undefined;
  return {
    inputTokens: payload.inputTokens,
    outputTokens: payload.outputTokens,
    cachedInputTokens: payload.cachedInputTokens,
    cacheMissInputTokens: payload.cacheMissInputTokens,
  };
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
  error: string | null;
  /** Populated for Ollama only — the full list of locally-installed models. */
  availableModels: string[] | null;
  /** True if Ollama responded (even if the model is missing). Null for cloud. */
  reachable: boolean | null;
}

/**
 * LLM Service — delegates all AI calls to the Tauri Rust backend.
 * API keys are stored securely in the OS-level store, never in the browser.
 */
export const llmService = {
  async runStage(
    text: string,
    stage: PipelineStageConfig,
    config: PipelineConfig,
    previousResult: string | undefined,
    onPrompt?: (info: PromptInfo) => void,
    onIdleGrace?: () => void,
  ): Promise<UsageResult & { content: string }> {
    const streamId = `stage-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
      const result = await invoke<UsageResult & { content: string }>('run_stage', {
        text,
        stage,
        config,
        previousResult: previousResult || null,
        streamId,
        ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl,
      });
      logOperation({
        level: 'info',
        scope: 'invoke',
        message: 'Stage request completed',
        meta: { provider: stage.provider, model: stage.model, ...result },
      });
      return result;
    } finally {
      unlistenPrompt();
      unlistenAlive();
      useChunksStore.getState().setActiveStreamId(null);
    }
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
    onPrompt?: (info: PromptInfo) => void,
    onIdleGrace?: () => void,
  ): Promise<string> {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId !== streamId) return;
      if (!event.payload.done) {
        onToken(event.payload.token);
      } else {
        const usage = usageFromPayload(event.payload);
        if (onUsage && usage) onUsage(usage);
        if (usage) {
          logOperation({
            level: 'info',
            scope: 'invoke',
            message: 'Streaming stage completed',
            meta: { provider: stage.provider, model: stage.model, ...usage },
          });
        }
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
        streamId,
        ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl,
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
    onResponse?: (info: ResponseInfo) => void,
  ): Promise<Omit<JudgeResult, 'status'> & UsageResult> {
    const streamId = `judge-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let capturedUsage: TokenUsage | undefined;
    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId !== streamId) return;
      if (
        event.payload.done &&
        event.payload.inputTokens !== undefined &&
        event.payload.outputTokens !== undefined
      ) {
        capturedUsage = usageFromPayload(event.payload);
        if (capturedUsage) {
          logOperation({
            level: 'info',
            scope: 'invoke',
            message: 'Audit stream completed',
            meta: { provider: config.judgeProvider, model: config.judgeModel, ...capturedUsage },
          });
        }
      }
    });
    const unlistenPrompt = await listen<{ streamId: string; systemPrompt: string; userPrompt: string }>('chunk-prompt', (event) => {
      if (event.payload.streamId !== streamId) return;
      onPrompt?.({ systemPrompt: event.payload.systemPrompt, userPrompt: event.payload.userPrompt });
    });
    const unlistenResponse = await listen<{ streamId: string; kind: ResponseInfo['kind']; rawJson: string }>('chunk-response', (event) => {
      if (event.payload.streamId !== streamId) return;
      onResponse?.({ kind: event.payload.kind, rawJson: event.payload.rawJson });
    });
    const unlistenAlive = await listen<{ streamId: string }>('stream-alive', (event) => {
      if (event.payload.streamId !== streamId) return;
      onIdleGrace?.();
    });

    useChunksStore.getState().setActiveStreamId(streamId);
    try {
      const result = await invoke<Omit<JudgeResult, 'status'> & UsageResult>(
        'judge_translation',
        { originalText, translation, config: withUiLanguage(config), streamId, ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl },
      );
      return {
        ...result,
        inputTokens: capturedUsage?.inputTokens,
        outputTokens: capturedUsage?.outputTokens,
        cachedInputTokens: capturedUsage?.cachedInputTokens,
        cacheMissInputTokens: capturedUsage?.cacheMissInputTokens,
      };
    } finally {
      unlisten();
      unlistenPrompt();
      unlistenResponse();
      unlistenAlive();
      useChunksStore.getState().setActiveStreamId(null);
    }
  },

  async runCoherenceForChunk(
    input: { original: string; translation: string; blobContext?: string; currentChunkId?: string },
    config: PipelineConfig,
    onPrompt?: (info: PromptInfo) => void,
    onIdleGrace?: () => void,
    onResponse?: (info: ResponseInfo) => void,
  ): Promise<{ issues: Issue[] } & UsageResult> {
    const streamId = `coherence-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let capturedUsage: TokenUsage | undefined;
    const unlisten = await listen<StreamTokenPayload>('stream-token', (event) => {
      if (event.payload.streamId !== streamId) return;
      if (
        event.payload.done &&
        event.payload.inputTokens !== undefined &&
        event.payload.outputTokens !== undefined
      ) {
        capturedUsage = usageFromPayload(event.payload);
        if (capturedUsage) {
          logOperation({
            level: 'info',
            scope: 'invoke',
            message: 'Coherence stream completed',
            meta: { provider: config.judgeProvider, model: config.judgeModel, ...capturedUsage },
          });
        }
      }
    });
    const unlistenPrompt = await listen<{ streamId: string; systemPrompt: string; userPrompt: string }>('chunk-prompt', (event) => {
      if (event.payload.streamId !== streamId) return;
      onPrompt?.({ systemPrompt: event.payload.systemPrompt, userPrompt: event.payload.userPrompt });
    });
    const unlistenResponse = await listen<{ streamId: string; kind: ResponseInfo['kind']; rawJson: string }>('chunk-response', (event) => {
      if (event.payload.streamId !== streamId) return;
      onResponse?.({ kind: event.payload.kind, rawJson: event.payload.rawJson });
    });
    const unlistenAlive = await listen<{ streamId: string }>('stream-alive', (event) => {
      if (event.payload.streamId !== streamId) return;
      onIdleGrace?.();
    });

    useChunksStore.getState().setActiveStreamId(streamId);
    try {
      const result = await invoke<{ issues: Issue[] } & UsageResult>(
        'run_coherence_for_chunk',
        { input, config: withUiLanguage(config), streamId, ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl },
      );
      return {
        ...result,
        inputTokens: capturedUsage?.inputTokens,
        outputTokens: capturedUsage?.outputTokens,
        cachedInputTokens: capturedUsage?.cachedInputTokens,
        cacheMissInputTokens: capturedUsage?.cacheMissInputTokens,
      };
    } finally {
      unlisten();
      unlistenPrompt();
      unlistenResponse();
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
    return invoke<string>('refine_prompt', { prompt, provider, model, context, ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl });
  },

  async testConnection(provider: string): Promise<boolean> {
    return invoke<boolean>('test_provider_connection', { provider, ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl });
  },

  async computeBlobs(
    chunks: Array<{ id: string; text: string }>,
    budgetTokens: number,
    overlap: number,
  ): Promise<Array<{ chunkId: string; blobId: string; position: number; referenceChunkIds: string[] }>> {
    return invoke<Array<{ chunkId: string; blobId: string; position: number; referenceChunkIds: string[] }>>('compute_blobs', {
      chunks,
      budgetTokens,
      overlap,
    });
  },

  /** Run pre-flight checks for the given (provider, model, label) entries. */
  async preflightPipeline(
    checks: Array<{ provider: string; model: string; label: string }>,
  ): Promise<PreflightCheckResult[]> {
    return invoke<PreflightCheckResult[]>('preflight_pipeline', { checks, ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl });
  },
};

/**
 * Ollama service for local model management.
 */
export const ollamaService = {
  async listModels(): Promise<string[]> {
    logOperation({ level: 'info', scope: 'invoke', message: 'Invoking backend model listing for Ollama' });
    return invoke<string[]>('list_ollama_models', { ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl });
  },

  async checkStatus(): Promise<boolean> {
    logOperation({ level: 'info', scope: 'invoke', message: 'Invoking backend reachability check for Ollama' });
    return invoke<boolean>('check_ollama_status', { ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl });
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
      ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl,
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

  async discoverProviderModels(provider: string): Promise<DiscoveredProviderModel[]> {
    return invoke<DiscoveredProviderModel[]>('discover_provider_models', {
      provider,
      ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl,
    });
  },
};
