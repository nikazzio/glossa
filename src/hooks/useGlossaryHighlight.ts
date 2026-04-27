import { useMemo } from 'react';
import type { GlossaryEntry } from '../types';

export interface HighlightResult {
  html: string;
  matchCount: number;
  totalTerms: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(term: string): RegExp {
  const escaped = escapeRegex(term);
  // Word boundaries work for ASCII; for non-ASCII (Greek etc.) use lookaround
  const hasNonWord = /[^\w\s]/.test(term);
  const pattern = hasNonWord
    ? `(?<![\\w\\u0370-\\u03FF\\u1F00-\\u1FFF])${escaped}(?![\\w\\u0370-\\u03FF\\u1F00-\\u1FFF])`
    : `\\b${escaped}\\b`;
  return new RegExp(pattern, 'gi');
}

export function useGlossaryHighlight(
  text: string,
  glossary: GlossaryEntry[],
  mode: 'source' | 'translation',
): HighlightResult {
  const validEntries = useMemo(
    () => glossary.filter((e) => e.term.trim() && e.translation.trim()),
    [glossary],
  );

  const patterns = useMemo(
    () =>
      validEntries.map((e) => ({
        entry: e,
        termRe: buildPattern(e.term),
        transRe: buildPattern(e.translation),
      })),
    [validEntries],
  );

  return useMemo(() => {
    if (!text || patterns.length === 0) {
      return { html: escapeHtml(text), matchCount: 0, totalTerms: validEntries.length };
    }

    if (mode === 'source') {
      let html = escapeHtml(text);
      for (const { entry, termRe } of patterns) {
        const tooltip = escapeHtml(
          `→ ${entry.translation}${entry.notes ? ` | ${entry.notes}` : ''}`,
        );
        html = html.replace(
          termRe,
          (match) => `<mark class="hl-source-term" title="${tooltip}">${escapeHtml(match)}</mark>`,
        );
      }
      return { html, matchCount: 0, totalTerms: validEntries.length };
    }

    // translation mode: check source terms in source text and translations in translation text
    let matchCount = 0;
    let html = escapeHtml(text);

    for (const { entry, transRe } of patterns) {
      const tooltip = escapeHtml(
        `atteso: ${entry.translation}${entry.notes ? ` | ${entry.notes}` : ''}`,
      );
      let found = false;
      html = html.replace(transRe, (match) => {
        found = true;
        return `<mark class="hl-match" title="${tooltip}">${escapeHtml(match)}</mark>`;
      });
      if (found) matchCount++;
    }

    return { html, matchCount, totalTerms: validEntries.length };
  }, [text, patterns, mode, validEntries.length]);
}
