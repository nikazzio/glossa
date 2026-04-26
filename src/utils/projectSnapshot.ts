import type { usePipelineStore } from '../stores/pipelineStore';
import type { useChunksStore } from '../stores/chunksStore';
import type { useUiStore } from '../stores/uiStore';

export function buildProjectSnapshot(input: {
  inputText: string;
  config: ReturnType<typeof usePipelineStore.getState>['config'];
  chunks: ReturnType<typeof useChunksStore.getState>['chunks'];
  viewMode: ReturnType<typeof useUiStore.getState>['viewMode'];
}): string {
  return JSON.stringify({
    inputText: input.inputText,
    config: input.config,
    chunks: input.chunks,
    viewMode: input.viewMode,
  });
}
