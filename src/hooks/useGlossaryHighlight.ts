import { useMemo } from 'react';
import type { GlossaryEntry } from '../types';
import { useDebounce } from './useDebounce';

export interface HighlightResult {
  html: string;
  matchCount: number;
  totalTerms: number;
}

export function escapeHtml(text: string): string {
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
  const trimmed = term.trim();
  const lastChar = trimmed.slice(-1).toLowerCase();

  // Italian invariable nouns end in accented vowels (città, università)
  const isInvariable = /[àèìòùáéíóú]$/.test(trimmed);

  let corePattern: string;
  if (isInvariable) {
    corePattern = escapeRegex(trimmed);
  } else if (lastChar === 'o') {
    // libro → libri (IT), photo → photos (EN)
    corePattern = escapeRegex(trimmed.slice(0, -1)) + '(?:o|os|i)';
  } else if (lastChar === 'a') {
    // casa → case (IT), area → areas (EN)
    corePattern = escapeRegex(trimmed.slice(0, -1)) + '(?:a|as|e)';
  } else if (lastChar === 'e') {
    // cane → cani (IT), interface → interfaces (EN)
    corePattern = escapeRegex(trimmed.slice(0, -1)) + '(?:e|es|i)';
  } else {
    // consonant ending: cat → cats, box → boxes
    corePattern = escapeRegex(trimmed) + '(?:s|es)?';
  }

  // Word boundaries work for ASCII; for non-ASCII (Greek etc.) use lookaround
  const hasNonWord = /[^\w\s]/.test(trimmed);
  const pattern = hasNonWord
    ? `(?<![\\w\\u0370-\\u03FF\\u1F00-\\u1FFF])${corePattern}(?![\\w\\u0370-\\u03FF\\u1F00-\\u1FFF])`
    : `\\b${corePattern}\\b`;
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
  searchQuery = '',
): HighlightResult {
  const debouncedText = useDebounce(text, 300);
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
    if (text !== debouncedText) {
      return { html: escapeHtml(text), matchCount: 0, totalTerms: validEntries.length };
    }
    if (!debouncedText) {
      return { html: '', matchCount: 0, totalTerms: validEntries.length };
    }

    const spans: MatchSpan[] = [];

    if (patterns.length > 0) {
      if (mode === 'source') {
        for (const { entry, termRe } of patterns) {
          const tooltip = `→ ${entry.translation}${entry.notes ? ` | ${entry.notes}` : ''}`;
          spans.push(...findSpans(debouncedText, termRe, 'hl-source-term', tooltip, 0));
        }
      } else {
        // hl-match (priority 0): expected translation → correct
        // hl-mismatch (priority 1): source term found untranslated → missed
        for (const { entry, termRe, transRe } of patterns) {
          const tooltip = `→ ${entry.translation}${entry.notes ? ` | ${entry.notes}` : ''}`;
          spans.push(...findSpans(debouncedText, transRe, 'hl-match', tooltip, 0));
          spans.push(...findSpans(debouncedText, termRe, 'hl-mismatch', tooltip, 1));
        }
      }
    }

    if (searchQuery.trim()) {
      const searchRe = new RegExp(escapeRegex(searchQuery.trim()), 'gi');
      spans.push(...findSpans(debouncedText, searchRe, 'hl-search', '', 2));
    }

    const matchCount = mode === 'translation'
      ? patterns.filter(({ transRe }) => { transRe.lastIndex = 0; return transRe.test(debouncedText); }).length
      : 0;

    return { html: buildHtml(debouncedText, spans), matchCount, totalTerms: validEntries.length };
  }, [text, debouncedText, patterns, mode, validEntries.length, searchQuery]);
}
