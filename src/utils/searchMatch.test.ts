import { describe, expect, it } from 'vitest';
import { EMPTY_SEARCH } from '../services/federatedSearchService';
import type { IIIFDiscoveryResult } from '../types';
import { explainMatch, highlightTerms, matchTerms, snippetAround } from './searchMatch';

const card = (overrides: Partial<IIIFDiscoveryResult>): IIIFDiscoveryResult => ({
  id: 'x', title: 'Opera nova', creator: null, date: null, description: null, thumbnailUrl: null,
  mediaType: null, collection: null, language: null, volume: null, subjects: [], itemCount: null,
  manifestUrl: 'https://example.org/m.json', contributors: [], publisher: null, rights: [],
  physicalDescription: null, holdingInstitution: null, catalogUrl: null, pageUrl: null,
  ...overrides,
} as IIIFDiscoveryResult);

describe('matchTerms', () => {
  it('prende parole libere e campi, senza accenti e senza parole troppo corte', () => {
    expect(matchTerms({ ...EMPTY_SEARCH, query: 'Achille de Marozzò', author: 'Marozzo' })).toEqual(['achille', 'marozzo']);
  });
});

describe('highlightTerms', () => {
  it('evidenzia ignorando maiuscole e accenti, anche come inizio di parola', () => {
    expect(highlightTerms('Opera di ACHILLÈ Marozzo', ['achille'])).toEqual([
      { text: 'Opera di ', match: false },
      { text: 'ACHILLÈ', match: true },
      { text: ' Marozzo', match: false },
    ]);
    expect(highlightTerms('Achilles', ['achille']).map((part) => part.match)).toEqual([true, false]);
  });
});

describe('snippetAround', () => {
  it('riduce un testo lungo intorno alla prima parola trovata', () => {
    const text = `${'a '.repeat(100)}Achille Caulier${' b'.repeat(100)}`;
    const snippet = snippetAround(text, ['achille']);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('Achille Caulier');
  });
});

describe('explainMatch', () => {
  it('usa prima la sezione dichiarata dalla biblioteca', () => {
    const explanation = explainMatch(card({
      matchHints: [{ section: 'Additional Bibliography', text: 'Baudet Herenc; Achille Caulier' }],
    }), ['achille']);
    expect(explanation).toEqual({ kind: 'section', section: 'Additional Bibliography', localSection: false, text: 'Baudet Herenc; Achille Caulier' });
  });

  it('senza indicazioni cerca nei dati della scheda, e l\'autore non si ripete', () => {
    expect(explainMatch(card({ creator: 'Marozzo, Achille' }), ['marozzo'])).toEqual({
      kind: 'section', section: 'author', localSection: true, text: null,
    });
    expect(explainMatch(card({ subjects: ['Scherma', 'Achille Marozzo'] }), ['marozzo'])).toMatchObject({
      section: 'subjects', text: 'Scherma · Achille Marozzo',
    });
  });

  it('dice quando le parole non sono da nessuna parte nella scheda', () => {
    expect(explainMatch(card({ title: 'Le Journal illustré' }), ['marozzo'])).toEqual({ kind: 'elsewhere' });
  });

  it('senza parole da cercare non spiega niente', () => {
    expect(explainMatch(card({}), [])).toBeNull();
  });
});
