import type { Footnote } from '../types';

const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:\s*(.*)/;
const FOOTNOTE_MARKER = /\[\^[^\]]+\]/g;

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
  const currentTextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(FOOTNOTE_DEF);
    if (match) {
      if (currentId !== null) {
        map.set(currentId, currentTextLines.join('\n').trim());
      }
      currentId = match[1];
      currentTextLines.length = 0;
      currentTextLines.push(match[2]);
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
  const footnotes: Footnote[] = [];
  const markerRe = /\[\^([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = markerRe.exec(chunkText)) !== null) {
    const id = match[1];
    if (!seen.has(id) && footnoteMap.has(id)) {
      seen.add(id);
      footnotes.push({ id, marker: `[^${id}]`, text: footnoteMap.get(id)! });
    }
  }

  return footnotes;
}

export function stripFootnoteMarkers(text: string): string {
  return text.replace(FOOTNOTE_MARKER, '');
}
