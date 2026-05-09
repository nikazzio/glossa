import type { FootnoteDefinition } from '../types';
import type { PipelineConfig, TranslationChunk, ViewMode } from '../types';

export interface ProjectSnapshotInput {
  inputText: string;
  inputProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  config: PipelineConfig;
  chunks: TranslationChunk[];
  viewMode: ViewMode;
}

export function buildProjectSnapshot(input: ProjectSnapshotInput): string {
  return JSON.stringify({
    inputText: input.inputText,
    inputProcessingText: input.inputProcessingText,
    sourceFootnotes: input.sourceFootnotes,
    config: input.config,
    chunks: input.chunks,
    viewMode: input.viewMode,
  });
}
