/**
 * Normalizes imported text to a consistent internal format before chunking.
 *
 * Both 'plain' and 'markdown' receive the same mechanical cleanup:
 * - Normalize line endings to \n
 * - Strip trailing whitespace from each line
 * - Collapse 3+ consecutive blank lines to 2
 * - Trim leading/trailing whitespace from the document
 *
 * The format parameter is preserved for future divergence (e.g. plain-specific
 * heuristics) without changing call sites.
 */
export function normalizeImportedText(text: string, format: 'plain' | 'markdown'): string {
  void format;

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
