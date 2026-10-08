import { describe, expect, it } from 'vitest';
import type { GlossaryData } from '../services/statsService';
import { summarizeGlossaries } from './glossaryStats';

const base = (): GlossaryData => ({
  glossaries: [
    { id: 'g1', name: 'Orafo', source_language: 'Italian', target_language: 'English' },
    { id: 'g2', name: 'Orafo copia', source_language: 'Italian', target_language: 'English' },
  ],
  entries: [
    { id: 'e1', glossary_id: 'g1', term: 'Bottega', translation: 'workshop', created_at: '2026-09-01 10:00:00' },
    { id: 'e2', glossary_id: 'g1', term: 'orafo', translation: 'goldsmith', created_at: '2026-10-01 10:00:00' },
    { id: 'e3', glossary_id: 'g1', term: 'cesello', translation: 'chisel', created_at: '2026-10-02 10:00:00' },
    { id: 'e4', glossary_id: 'g2', term: 'bottega', translation: 'shop', created_at: '2026-10-02 10:00:00' },
  ],
  links: [{ glossary_id: 'g1', project_id: 'p', workspace_id: 'w' }],
  overrides: [],
  chunks: [
    { project_id: 'p', completed: 1, source_text: 'La bottega dell’orafo', translation_text: 'The goldsmith’s workshop' },
    { project_id: 'p', completed: 1, source_text: 'Torna in bottega, bottega!', translation_text: 'Back to the shop' },
    { project_id: 'p', completed: 0, source_text: 'Un orafo', translation_text: '' },
  ],
});

describe('glossary statistics', () => {
  it('counts one case per translated fragment and term, as whole words, ignoring case', () => {
    const report = summarizeGlossaries(base()).reports[0];
    // bottega×2 frammenti, orafo×1 (il terzo non è tradotto): 3 casi, 2 rispettati.
    expect(report).toMatchObject({ name: 'Orafo', cases: 3, respected: 2, entries: 3, projects: 1 });
    expect(report.rate).toBeCloseTo(2 / 3);
    expect(report.interval!.low).toBeLessThan(2 / 3);
    expect(report.mostMissed).toEqual([{ term: 'Bottega', misses: 1 }]);
  });

  it('lists entries never found in the source texts', () => {
    expect(summarizeGlossaries(base()).reports[0].neverSeen).toEqual(['cesello']);
  });

  it('uses the workspace correction and skips hidden entries', () => {
    const data = { ...base(), overrides: [
      { workspace_id: 'w', entry_id: 'e1', translation: 'shop / workshop', hidden: 0 },
      { workspace_id: 'w', entry_id: 'e2', translation: null, hidden: 1 },
    ] };
    const report = summarizeGlossaries(data).reports[0];
    expect(report).toMatchObject({ cases: 2, respected: 2 });
  });

  it('does not match a term inside a longer word', () => {
    const data = { ...base(), chunks: [{ project_id: 'p', completed: 1, source_text: 'botteghaio orafi', translation_text: '' }] };
    expect(summarizeGlossaries(data).reports[0].cases).toBe(0);
  });

  it('finds the same term with different translations across glossaries', () => {
    const conflicts = summarizeGlossaries(base()).conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].term).toBe('Bottega');
    expect(conflicts[0].translations.map((entry) => entry.translation)).toEqual(['workshop', 'shop']);
  });

  it('marks a glossary without translated texts as unused', () => {
    expect(summarizeGlossaries(base()).reports[1]).toMatchObject({ name: 'Orafo copia', hasTexts: false, rate: null });
  });
});
