import type { Footnote } from '../types';

const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:\s*(.*)/;
// Negative lookbehind skips escaped markers like \[^1\] that appear as literal text.
const FOOTNOTE_MARKER = /(?<!\\)\[\^[^\]]+\]/g;

// Superscript digits 0–9 (Unicode). Used to render inline footnote positions.
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
// Matches [¹], [²], [¹²], etc. — bracketed superscript markers in originalText.
// ⁰ U+2070, ¹ U+00B9, ² U+00B2, ³ U+00B3 are not contiguous — enumerate explicitly.
export const BRACKETED_SUPERSCRIPT_RE = /\[[⁰¹²³⁴⁵⁶⁷⁸⁹]+\]/g;

function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[Number(d)] ?? d)
    .join('');
}

export function extractFootnotes(markdown: string): {
  cleanText: string;
  footnoteMap: Map<string, string>;
} {
  const lines = markdown.split('\n');

  let firstDefLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (FOOTNOTE_DEF.test(lines[i])) {
      firstDefLineIndex = i;
      break;
    }
  }

  if (firstDefLineIndex === -1) {
    return { cleanText: markdown, footnoteMap: new Map() };
  }

  const cleanText = lines.slice(0, firstDefLineIndex).join('\n').trimEnd();
  const footnoteMap = parseFootnoteDefinitions(lines.slice(firstDefLineIndex));

  return { cleanText, footnoteMap };
}

function parseFootnoteDefinitions(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let currentId: string | null = null;
  let currentTextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(FOOTNOTE_DEF);
    if (match) {
      if (currentId !== null) {
        map.set(currentId, currentTextLines.join('\n').trim());
      }
      currentId = match[1];
      currentTextLines = [match[2]];
    } else if (currentId !== null) {
      currentTextLines.push(line);
    }
  }

  if (currentId !== null) {
    map.set(currentId, currentTextLines.join('\n').trim());
  }

  return map;
}

export function assignChunkFootnotes(
  chunkText: string,
  footnoteMap: Map<string, string>,
): Footnote[] {
  const ids = [...footnoteMap.keys()];
  const footnotes: Footnote[] = [];
  const markerRe = /(?<!\\)\[\^([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = markerRe.exec(chunkText)) !== null) {
    const id = match[1];
    if (!seen.has(id) && footnoteMap.has(id)) {
      seen.add(id);
      const displayNum = ids.indexOf(id) + 1;
      footnotes.push({ id, marker: `[${toSuperscript(displayNum)}]`, text: footnoteMap.get(id)! });
    }
  }

  return footnotes;
}

export function stripFootnoteMarkers(text: string): string {
  return text.replace(FOOTNOTE_MARKER, '');
}

/**
 * Replaces [^id] inline markers with bracketed superscript numbers, e.g. [¹].
 * The id is parsed as an integer when possible; otherwise a sequential index is used.
 * Call this instead of stripFootnoteMarkers when you want to keep position info visible.
 */
export function replaceMarkersWithSuperscripts(
  text: string,
  footnoteMap: Map<string, string>,
): string {
  const ids = [...footnoteMap.keys()];
  return text.replace(/(?<!\\)\[\^([^\]]+)\]/g, (_, id) =>
    footnoteMap.has(id) ? `[${toSuperscript(ids.indexOf(id) + 1)}]` : '',
  );
}

/** Strips bracketed superscript markers ([¹], [²], …) added by replaceMarkersWithSuperscripts. */
export function stripSuperscriptMarkers(text: string): string {
  return text.replace(BRACKETED_SUPERSCRIPT_RE, '');
}

/**
 * Post-processes an already HTML-escaped string, wrapping bracketed superscript
 * markers in a styled span so they render in the editorial accent colour.
 * Safe to call after escapeHtml or buildHtml — the bracket characters are not
 * HTML special chars and pass through entity-escaping unchanged.
 */
export function highlightSuperscriptMarkersHtml(html: string): string {
  // Split on HTML tags so the replacement only affects text nodes, not attributes.
  return html
    .split(/(<[^>]*>)/)
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment.replace(
            BRACKETED_SUPERSCRIPT_RE,
            (match) => `<span class="hl-footnote-marker">${match}</span>`,
          ),
    )
    .join('');
}
