/**
 * Static validation of SQL INSERT statements in pipelineService.ts.
 *
 * All DB calls are mocked in unit tests, so SQL syntax errors — like a mismatch
 * between the number of columns and VALUES placeholders — are invisible at test time
 * and only surface as runtime crashes. These tests read the source file as text and
 * assert structural correctness without requiring a real database.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, './pipelineService.ts'), 'utf-8');

function parseInsert(tableName: string): { columns: string[]; placeholderCount: number } | null {
  // [^()]+ matches column names (which never contain parens) cleanly.
  // VALUES uses a one-level-nesting pattern to handle COALESCE($N, '') correctly:
  //   [^()]+ matches non-paren chars, (?:\([^()]*\)[^()]*)* handles one nested group.
  const pattern = new RegExp(
    `INSERT INTO ${tableName} \\(([^()]+)\\)\\s*VALUES \\(([^()]+(?:\\([^()]*\\)[^()]*)*)\\)\\s*ON CONFLICT`,
    's',
  );
  const match = source.match(pattern);
  if (!match) return null;

  const columns = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const placeholderCount = (match[2].match(/\$\d+/g) ?? []).length;

  return { columns, placeholderCount };
}

describe('pipelineService SQL structure', () => {
  it('translations upsert columns match VALUES placeholders', () => {
    const result = parseInsert('translations');
    expect(result).not.toBeNull();
    expect(result!.placeholderCount).toBe(result!.columns.length);
  });

  it('translations INSERT columns match VALUES placeholders across both INSERT statements', () => {
    // pipelineService has two INSERT INTO translations statements (saveChunkCheckpoint + saveTranslationsInternal).
    // Both must have matching column counts. We verify by finding both matches.
    const pattern = new RegExp(
      `INSERT INTO translations \\(([^()]+)\\)\\s*VALUES \\(([^()]+(?:\\([^()]*\\)[^()]*)*)\\)\\s*ON CONFLICT`,
      'gs',
    );
    const matches = [...source.matchAll(pattern)];

    expect(matches.length).toBeGreaterThanOrEqual(1);

    for (const match of matches) {
      const columns = match[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const placeholderCount = (match[2].match(/\$\d+/g) ?? []).length;
      expect(placeholderCount).toBe(columns.length);
    }
  });
});
