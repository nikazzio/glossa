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

interface MatchSpan {
  start: number;
  end: number;
  cls: string;
  tooltip: string;
  priority: number;
}

function findSpans(
  text: string,
  re: RegExp,
  cls: string,
  tooltip: string,
  priority: number,
): MatchSpan[] {
  const spans: MatchSpan[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, cls, tooltip, priority });
  }
  return spans;
}

// Runs matching on the raw text and builds HTML in one pass to avoid
// (a) entity-escaping breaking matches and (b) replacements matching inside markup.
function buildHtml(text: string, spans: MatchSpan[]): string {
  const sorted = [...spans].sort((a, b) =>
    a.start !== b.start
      ? a.start - b.start
      : a.priority !== b.priority
        ? a.priority - b.priority
        : (b.end - b.start) - (a.end - a.start),
  );
  let result = '';
  let pos = 0;
  for (const span of sorted) {
    if (span.start < pos) continue; // skip overlapping spans
    result += escapeHtml(text.slice(pos, span.start));
    result += `<mark class="${span.cls}" title="${escapeHtml(span.tooltip)}">${escapeHtml(text.slice(span.start, span.end))}</mark>`;
    pos = span.end;
  }
  result += escapeHtml(text.slice(pos));
  return result;
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
      const spans: MatchSpan[] = [];
      for (const { entry, termRe } of patterns) {
        const tooltip = `→ ${entry.translation}${entry.notes ? ` | ${entry.notes}` : ''}`;
        spans.push(...findSpans(text, termRe, 'hl-source-term', tooltip, 0));
      }
      return { html: buildHtml(text, spans), matchCount: 0, totalTerms: validEntries.length };
    }

    // translation mode:
    // - hl-match (priority 0): expected translation found → correctly translated
    // - hl-mismatch (priority 1): source term found untranslated → missed/wrong translation
    const spans: MatchSpan[] = [];
    let matchCount = 0;
    for (const { entry, termRe, transRe } of patterns) {
      const tooltip = `→ ${entry.translation}${entry.notes ? ` | ${entry.notes}` : ''}`;
      const transSpans = findSpans(text, transRe, 'hl-match', tooltip, 0);
      if (transSpans.length > 0) matchCount++;
      spans.push(...transSpans);
      spans.push(...findSpans(text, termRe, 'hl-mismatch', tooltip, 1));
    }
    return { html: buildHtml(text, spans), matchCount, totalTerms: validEntries.length };
  }, [text, patterns, mode, validEntries.length]);
}
