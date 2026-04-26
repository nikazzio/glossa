import { describe, expect, it } from 'vitest';
import { buildImportPreview, buildSplitPreview } from './documentWorkflow';

describe('documentWorkflow', () => {
  it('builds an import preview with chunk and text statistics', () => {
    const preview = buildImportPreview('First paragraph.\n\nSecond paragraph.', {
      useChunking: true,
      targetChunkCount: 0,
    });

    expect(preview.stats.words).toBe(4);
    expect(preview.chunks).toHaveLength(2);
    expect(preview.chunks[0]).toEqual(
      expect.objectContaining({
        index: 0,
        text: 'First paragraph.',
        words: 2,
      }),
    );
  });

  it('builds a split preview around an explicit cursor position', () => {
    const preview = buildSplitPreview('Alpha beta gamma delta', 11);

    expect(preview.isValid).toBe(true);
    expect(preview.beforeText).toBe('Alpha beta');
    expect(preview.afterText).toBe('gamma delta');
  });
});
