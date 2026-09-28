import { describe, expect, it } from 'vitest';
import { EMPTY_SEARCH } from '../services/federatedSearchService';
import type { IIIFDiscoveryResult } from '../types';
import { foundOutsideRecord, highlightTerms, matchTerms } from './searchMatch';

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

describe('foundOutsideRecord', () => {
  it('vale solo quando nessun dato della scheda contiene le parole', () => {
    expect(foundOutsideRecord(card({ title: 'Le Journal illustré' }), ['marozzo'])).toBe(true);
    expect(foundOutsideRecord(card({ subjects: ['Scherma', 'Achille Marozzo'] }), ['marozzo'])).toBe(false);
    expect(foundOutsideRecord(card({ matchHints: [{ section: 'Bibliography', text: 'Achille Caulier' }] }), ['achille'])).toBe(false);
  });

  it('senza parole da cercare non segna niente', () => {
    expect(foundOutsideRecord(card({}), [])).toBe(false);
  });
});
