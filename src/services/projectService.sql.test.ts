/**
 * Static validation of SQL INSERT statements in projectService.ts.
 *
 * All DB calls are mocked in the unit tests, so SQL syntax errors — like a
 * mismatch between the number of columns and the number of VALUES placeholders
 * — are invisible at test time and only surface as runtime crashes.
 *
 * These tests read the source file as text and assert structural correctness
 * without requiring a real database or additional dependencies. They would
 * have caught the bug where pipeline_configs had 17 columns but only 16
 * VALUES placeholders ($17 for review_provider_options was missing).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, './projectService.ts'), 'utf-8');

function parseInsert(tableName: string): { columns: string[]; placeholderCount: number } | null {
  // [^()]+ matches column names (which never contain parens) cleanly.
  // VALUES uses a one-level-nesting pattern to handle COALESCE($N, '') correctly:
  //   [^()]+ matches non-paren chars, (?:\([^()]*\)[^()]*)* handles one nested group.
  // The regex skips the first INSERT INTO pipeline_configs (4-col create) automatically
  // because that INSERT has no ON CONFLICT clause, so the regex only matches the
  // upsert INSERT that does.
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

  // Count every $N occurrence in the VALUES clause only.
  // COALESCE($9, '') still contributes exactly one $N per column.
  const placeholderCount = (match[2].match(/\$\d+/g) ?? []).length;

  return { columns, placeholderCount };
}

describe('projectService SQL structure', () => {
  it('pipeline_configs INSERT columns match VALUES placeholders', () => {
    const result = parseInsert('pipeline_configs');
    expect(result).not.toBeNull();
    expect(result!.placeholderCount).toBe(result!.columns.length);
  });

  it('translations INSERT columns match VALUES placeholders', () => {
    const result = parseInsert('translations');
    expect(result).not.toBeNull();
    expect(result!.placeholderCount).toBe(result!.columns.length);
  });
});
