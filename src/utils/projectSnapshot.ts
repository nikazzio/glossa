import type { FootnoteDefinition } from '../types';
import type { PipelineConfig, TranslationChunk } from '../types';

export interface ProjectSnapshotInput {
  inputText: string;
  inputProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  config: PipelineConfig;
  chunks: TranslationChunk[];
}

export function buildProjectSnapshot(input: ProjectSnapshotInput): string {
  return JSON.stringify({
    inputText: input.inputText,
    inputProcessingText: input.inputProcessingText,
    sourceFootnotes: input.sourceFootnotes,
    config: input.config,
    chunks: input.chunks,
  });
}
