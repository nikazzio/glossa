import type { PipelineConfig, TranslationChunk, ViewMode } from '../types';

export interface ProjectSnapshotInput {
  inputText: string;
  config: PipelineConfig;
  chunks: TranslationChunk[];
  viewMode: ViewMode;
}

export function buildProjectSnapshot(input: ProjectSnapshotInput): string {
  return JSON.stringify({
    inputText: input.inputText,
    config: input.config,
    chunks: input.chunks,
    viewMode: input.viewMode,
  });
}
