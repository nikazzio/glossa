import { useMemo } from 'react';
import { diffWords } from 'diff';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDiffHtml(textA: string, textB: string): string {
  const changes = diffWords(textA, textB);
  return changes
    .map((part) => {
      if (part.added) return `<mark class="hl-diff-add">${escapeHtml(part.value)}</mark>`;
      if (part.removed) return `<mark class="hl-diff-rm">${escapeHtml(part.value)}</mark>`;
      return escapeHtml(part.value);
    })
    .join('');
}

export function useStageDiff(textA: string, textB: string): { html: string } {
  const html = useMemo(() => {
    if (!textA && !textB) return '';
    return buildDiffHtml(textA, textB);
  }, [textA, textB]);
  return { html };
}
