import { describe, expect, it } from 'vitest';
import type { Annotation } from '../types';
import { composeAnnotatedMarkdown } from './annotationMarkdown';

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: overrides.id ?? 'ann-1',
    chunkId: 'chunk-1',
    pipelineId: 'pipeline-1',
    type: overrides.type ?? 'comment',
    content: overrides.content ?? 'A note',
    anchorText: overrides.anchorText ?? null,
    sequence: overrides.sequence ?? 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('composeAnnotatedMarkdown', () => {
  it('returns the draft unchanged when there are no annotations', () => {
    const draft = 'Plain translated text.';
    expect(composeAnnotatedMarkdown(draft, [])).toBe(draft);
  });

  it('returns the draft unchanged when no annotation has an anchor', () => {
    const draft = 'Plain translated text.';
    const annotations = [makeAnnotation({ content: 'General comment', anchorText: null })];
    expect(composeAnnotatedMarkdown(draft, annotations)).toBe(draft);
  });

  it('inserts a marker after the anchor and appends the definition with the anchor', () => {
    const draft = 'The quick brown fox jumps.';
    const annotations = [
      makeAnnotation({ id: 'a', content: 'About the fox', anchorText: 'brown fox' }),
    ];

    const result = composeAnnotatedMarkdown(draft, annotations);

    expect(result).toContain('The quick brown fox[^a1] jumps.');
    expect(result).toContain('[^a1]: About the fox — «brown fox»');
  });

  it('does NOT mutate the draft when the anchor is not found', () => {
    const draft = 'No matching text here.';
    const annotations = [makeAnnotation({ content: 'Orphan', anchorText: 'missing phrase' })];

    const result = composeAnnotatedMarkdown(draft, annotations);

    expect(result).toBe(draft);
  });

  it('numbers markers by reading order, not annotation order', () => {
    const draft = 'Alpha then Beta then Gamma.';
    const annotations = [
      makeAnnotation({ id: 'g', content: 'on gamma', anchorText: 'Gamma' }),
      makeAnnotation({ id: 'a', content: 'on alpha', anchorText: 'Alpha' }),
    ];

    const result = composeAnnotatedMarkdown(draft, annotations);

    // Alpha appears first in the text → gets a1, Gamma → a2.
    expect(result).toContain('Alpha[^a1]');
    expect(result).toContain('Gamma[^a2]');
    expect(result).toContain('[^a1]: on alpha — «Alpha»');
    expect(result).toContain('[^a2]: on gamma — «Gamma»');
  });

  it('collapses newlines inside the note content into a single line', () => {
    const draft = 'Anchor word present.';
    const annotations = [
      makeAnnotation({ content: 'Line one\nLine two', anchorText: 'Anchor word' }),
    ];

    const result = composeAnnotatedMarkdown(draft, annotations);

    expect(result).toContain('[^a1]: Line one Line two — «Anchor word»');
  });
});
