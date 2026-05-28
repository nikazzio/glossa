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

// Classes that use background-color (mutually exclusive per interval).
// Classes not in this set use text-decoration and can coexist with a background.
const BG_CLASSES = new Set(['hl-match', 'hl-mismatch', 'hl-search', 'hl-audit']);

// Builds HTML using an interval-breakpoint approach so that non-conflicting
// highlight properties (e.g. underline + background) can coexist on the same
// <mark> element when their spans overlap.
function buildHtml(text: string, spans: MatchSpan[]): string {
  if (spans.length === 0) return escapeHtml(text);

  const pts = [...new Set([0, text.length, ...spans.flatMap(s => [s.start, s.end])])].sort((a, b) => a - b);

  let result = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const from = pts[i];
    const to = pts[i + 1];
    const segment = escapeHtml(text.slice(from, to));

    const active = spans.filter(s => s.start <= from && s.end >= to);
    if (active.length === 0) { result += segment; continue; }

    // Among background spans, keep only the highest-priority one (lowest number).
    // Decoration spans (underline) don't conflict with backgrounds — keep all.
    const bgWinner = active
      .filter(s => BG_CLASSES.has(s.cls))
      .sort((a, b) => a.priority - b.priority || (b.end - b.start) - (a.end - a.start))[0];
    const decoClasses = [...new Set(active.filter(s => !BG_CLASSES.has(s.cls)).map(s => s.cls))];

    const classes = [...(bgWinner ? [bgWinner.cls] : []), ...decoClasses];
    const tooltip = [...active].sort((a, b) => a.priority - b.priority).find(s => s.tooltip)?.tooltip ?? '';

    result += `<mark class="${classes.join(' ')}"${tooltip ? ` title="${escapeHtml(tooltip)}"` : ''}>${segment}</mark>`;
  }

  return result;
}

export function useGlossaryHighlight(
  text: string,
  glossary: GlossaryEntry[],
  mode: 'source' | 'translation',
  searchQuery = '',
  auditQuery = '',
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

    if (auditQuery.trim()) {
      const auditRe = new RegExp(escapeRegex(auditQuery.trim()), 'gi');
      spans.push(...findSpans(debouncedText, auditRe, 'hl-audit', '', 3));
    }

    const matchCount = mode === 'translation'
      ? patterns.filter(({ transRe }) => { transRe.lastIndex = 0; return transRe.test(debouncedText); }).length
      : 0;

    return { html: buildHtml(debouncedText, spans), matchCount, totalTerms: validEntries.length };
  }, [text, debouncedText, patterns, mode, validEntries.length, searchQuery, auditQuery]);
}
