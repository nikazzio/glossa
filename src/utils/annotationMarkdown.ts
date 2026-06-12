import type { Annotation } from '../types';

// GFM footnote identifier prefix for annotation-derived notes. Identifier values
// only need to be unique/stable — GFM renders sequential display numbers itself.
const MARKER_PREFIX = 'a';

interface Placement {
  annotation: Annotation;
  anchor: string;
  index: number;
  id: string;
}

/**
 * Builds a GFM-markdown view of a translation draft with annotation notes,
 * WITHOUT mutating the stored draft. For every annotation that has an anchor
 * found in the draft, a `[^id]` marker is inserted after the anchor and a
 * matching `[^id]: content — «anchor»` definition is appended. The original
 * draft text is never written back, so it cannot be corrupted.
 *
 * Annotations without an anchor (or whose anchor is not present in the draft)
 * produce no inline marker and are intentionally omitted — they live as cards
 * in the notes panel, not as inline footnotes.
 */
export function composeAnnotatedMarkdown(draft: string, annotations: Annotation[]): string {
  const placements = resolvePlacements(draft, annotations);
  if (placements.length === 0) return draft;

  // Insert markers right-to-left so earlier indices stay valid as the string grows.
  let body = draft;
  for (const placement of [...placements].reverse()) {
    const insertAt = placement.index + placement.anchor.length;
    body = `${body.slice(0, insertAt)}[^${placement.id}]${body.slice(insertAt)}`;
  }

  const definitions = placements
    .map(({ id, annotation, anchor }) => {
      const content = annotation.content.replace(/\s*\n+\s*/g, ' ').trim();
      return `[^${id}]: ${content} — «${anchor}»`;
    })
    .join('\n\n');

  return `${body}\n\n${definitions}`;
}

function resolvePlacements(draft: string, annotations: Annotation[]): Placement[] {
  return annotations
    .map((annotation): Omit<Placement, 'id'> | null => {
      const anchor = annotation.anchorText?.trim();
      if (!anchor) return null;
      const index = draft.indexOf(anchor);
      return index === -1 ? null : { annotation, anchor, index };
    })
    .filter((placement): placement is Omit<Placement, 'id'> => placement !== null)
    // Reading order → GFM numbers the footnotes 1..n following the text.
    .sort((a, b) => a.index - b.index)
    .map((placement, order) => ({ ...placement, id: `${MARKER_PREFIX}${order + 1}` }));
}
