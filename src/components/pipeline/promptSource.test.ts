import { describe, expect, it } from 'vitest';
import type { PromptTemplate } from '../../types';
import { describePromptSource } from './promptSource';

const template: PromptTemplate = { id: 't1', name: 'core v1', prompt: 'Translate closely.', context: 'stage', workflow: 'translation', createdAt: '' };

describe('describePromptSource', () => {
  it('names the template whose text matches, ignoring outer spaces', () => {
    expect(describePromptSource('  Translate closely.\n', [template], 'Default.')).toEqual({ kind: 'template', name: 'core v1' });
  });

  it('prefers the default when the text is the default one', () => {
    expect(describePromptSource('Default.', [template], 'Default.')).toEqual({ kind: 'default' });
  });

  it('reports custom text and empty text', () => {
    expect(describePromptSource('Something else.', [template], 'Default.')).toEqual({ kind: 'custom' });
    expect(describePromptSource('  ', [template])).toEqual({ kind: 'empty' });
  });
});
