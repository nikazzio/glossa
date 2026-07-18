import type {
  DocumentFormat,
  DocumentRenderProfile,
  Footnote,
  FootnoteDefinition,
  TranslationChunk,
} from '../types';
import { assignChunkFootnotes, extractFootnotes } from './footnoteExtractor';

export interface SourceDocumentState {
  displayText: string;
  processingText: string;
  footnotes: FootnoteDefinition[];
  renderProfile: DocumentRenderProfile;
}

export function deriveSourceDocumentState(
  displayText: string,
  options: {
    markdownAware?: boolean;
    documentFormat?: DocumentFormat;
    renderProfile?: DocumentRenderProfile;
  } = {},
): SourceDocumentState {
  const renderProfile = normalizeRenderProfile(options);
  const trimmedDisplayText = displayText.trim();

  if (renderProfile !== 'markdown') {
    return {
      displayText: trimmedDisplayText,
      processingText: trimmedDisplayText,
      footnotes: [],
      renderProfile,
    };
  }

  const extracted = extractFootnotes(trimmedDisplayText);
  return {
    displayText: trimmedDisplayText,
    processingText: extracted.cleanText.trim(),
    footnotes: Array.from(extracted.footnoteMap.entries()).map(([id, text]) => ({ id, text })),
    renderProfile,
  };
}

export function normalizeRenderProfile(options: {
  markdownAware?: boolean;
  documentFormat?: DocumentFormat;
  renderProfile?: DocumentRenderProfile;
}): DocumentRenderProfile {
  if (options.renderProfile) return options.renderProfile;
  if (options.markdownAware || options.documentFormat === 'markdown') return 'markdown';
  return 'plain-text';
}

function buildFootnoteMap(footnotes: FootnoteDefinition[]): Map<string, string> {
  return new Map(footnotes.map((footnote) => [footnote.id, footnote.text]));
}

/**
 * Returns the chunk processing text for display, keeping [^id] markdown
 * footnote markers in their original form. Both source and translation pages
 * use the same [^id] format, highlighted identically via hl-footnote-marker.
 */
export function deriveChunkDisplayText(processingText: string, _footnotes: FootnoteDefinition[]): string {
  return processingText;
}

export function buildChunkFootnotes(
  sourceProcessingText: string,
  footnotes: FootnoteDefinition[],
): Footnote[] | undefined {
  if (footnotes.length === 0) return undefined;
  const assigned = assignChunkFootnotes(sourceProcessingText, buildFootnoteMap(footnotes));
  return assigned.length > 0 ? assigned : undefined;
}

export function updateChunkSourceFields(
  chunk: TranslationChunk,
  sourceDisplayText: string,
  sourceProcessingText: string,
  footnotes?: Footnote[],
): TranslationChunk {
  return {
    ...chunk,
    sourceDisplayText,
    sourceProcessingText,
    ...(footnotes?.length ? { footnotes } : { footnotes: undefined }),
  };
}

export function updateChunkTranslationFields(
  chunk: TranslationChunk,
  translationDisplayText: string,
  translationProcessingText = translationDisplayText,
): TranslationChunk {
  return {
    ...chunk,
    translationDisplayText,
    translationProcessingText,
  };
}

export function composeDocumentProcessingText(chunks: TranslationChunk[]): string {
  return chunks.map((chunk) => chunk.sourceProcessingText.trim()).filter(Boolean).join('\n\n');
}

export function composeDocumentDisplayText(
  processingText: string,
  renderProfile: DocumentRenderProfile,
  footnotes: FootnoteDefinition[],
): string {
  const trimmed = processingText.trim();
  if (renderProfile !== 'markdown' || footnotes.length === 0) {
    return trimmed;
  }

  const footnoteLines = footnotes.map((footnote) => `[^${footnote.id}]: ${footnote.text}`);
  return [trimmed, footnoteLines.join('\n\n')].filter(Boolean).join('\n\n');
}
