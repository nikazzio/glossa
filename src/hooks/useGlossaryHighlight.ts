import { useMemo } from 'react';
import type { AnnotationType, GlossaryEntry } from '../types';
import { useDebounce } from './useDebounce';

export interface AnnotationAnchor {
  text: string;
  type: AnnotationType;
}

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
const BG_CLASSES = new Set([
  'hl-match', 'hl-mismatch', 'hl-search', 'hl-audit',
  'hl-annot-comment', 'hl-annot-doubt', 'hl-annot-problem', 'hl-annot-approved',
]);

// Builds HTML using an interval-breakpoint approach so that non-conflicting
// highlight properties (e.g. underline + background) can coexist on the same
// <mark> element when their spans overlap.
function buildHtml(text: string, spans: MatchSpan[]): string {
  if (spans.length === 0) return escapeHtml(text);

  const pts = [...new Set([0, text.length, ...spans.flatMap(s => [s.start, s.end])])].sort((a, b) => a - b);

  const bgSpans = spans
    .filter(s => BG_CLASSES.has(s.cls))
    .sort((a, b) => a.priority - b.priority || (b.end - b.start) - (a.end - a.start));
  const decoSpans = spans.filter(s => !BG_CLASSES.has(s.cls));

  let result = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const from = pts[i];
    const to = pts[i + 1];
    const segment = escapeHtml(text.slice(from, to));

    const activeBg = bgSpans.filter(s => s.start <= from && s.end >= to);
    const activeDeco = decoSpans.filter(s => s.start <= from && s.end >= to);

    if (activeBg.length === 0 && activeDeco.length === 0) { result += segment; continue; }

    const bgWinner = activeBg[0];
    const decoClasses = [...new Set(activeDeco.map(s => s.cls))];
    const classes = [...(bgWinner ? [bgWinner.cls] : []), ...decoClasses];
    const tooltip = activeBg[0]?.tooltip || activeDeco[0]?.tooltip || '';

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
  annotationAnchors: AnnotationAnchor[] = [],
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

  const anchorsKey = annotationAnchors.map((a) => `${a.type}:${a.text}`).join('|');

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

    for (const anchor of annotationAnchors) {
      if (!anchor.text.trim()) continue;
      const anchorRe = new RegExp(escapeRegex(anchor.text.trim()), 'gi');
      spans.push(...findSpans(debouncedText, anchorRe, `hl-annot-${anchor.type}`, anchor.text, 4));
    }

    const matchCount = mode === 'translation'
      ? patterns.filter(({ transRe }) => { transRe.lastIndex = 0; return transRe.test(debouncedText); }).length
      : 0;

    return { html: buildHtml(debouncedText, spans), matchCount, totalTerms: validEntries.length };
  }, [text, debouncedText, patterns, mode, validEntries.length, searchQuery, auditQuery, anchorsKey]);
}
