/**
 * Normalizes imported text to a consistent internal format before chunking.
 *
 * Plain text can tolerate mechanical cleanup before chunking.
 * Markdown cannot: line breaks, indentation, trailing spaces, and runs of
 * blank lines may all be semantically significant.
 */
export function normalizeImportedText(text: string, format: 'plain' | 'markdown'): string {
  const normalizedLineEndings = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (format === 'markdown') {
    return normalizedLineEndings;
  }

  return normalizedLineEndings
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
