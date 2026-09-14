import { describe, expect, it } from 'vitest';
import type { IIIFDiscoveryResult } from '../types';
import { EMPTY_SEARCH, groupResults, matchesCriteria, type SearchResultPage } from './federatedSearchService';

const card = (overrides: Partial<IIIFDiscoveryResult> = {}): IIIFDiscoveryResult => ({
  id:'1',title:'Dante',creator:null,date:null,description:null,thumbnailUrl:null,
  mediaType:null,collection:null,language:null,volume:null,subjects:[],itemCount:null,
  manifestUrl:'https://example.org/manifest',contributors:[],publisher:null,rights:[],
  physicalDescription:null,holdingInstitution:null,catalogUrl:null,pageUrl:null,openable:null,raw:{},...overrides,
});
const page = (providerKey: string, results: IIIFDiscoveryResult[]): SearchResultPage => ({providerKey,executionId:providerKey,receivedAt:'2026-09-13',page:1,results});
describe('federated metadata and provenance', () => {
  it('does not infer manuscript or print from a generic text record', () => {
    expect(matchesCriteria(card({mediaType:'text'}),{...EMPTY_SEARCH,material:'manuscript'})).toBe('unknown');
    expect(matchesCriteria(card({mediaType:'manuscript'}),{...EMPTY_SEARCH,material:'printed'})).toBe('excluded');
  });
  it('keeps approximate dates unverifiable and uses overlap for declared ranges', () => {
    const criteria={...EMPTY_SEARCH,yearFrom:1400,yearTo:1450};
    expect(matchesCriteria(card({date:'ca. 1420'}),criteria)).toBe('unknown');
    expect(matchesCriteria(card({date:'1390–1410'}),criteria)).toBe('match');
    expect(matchesCriteria(card({date:'1500'}),criteria)).toBe('excluded');
  });
  it('deduplicates repeated provider occurrences but never equates cross-provider IDs', () => {
    const result=groupResults([page('a',[card(),card()]),page('b',[card({manifestUrl:'https://other.org/manifest'})])],EMPTY_SEARCH);
    expect(result).toHaveLength(2);
  });
  it('preserves original occurrences when exact manifests agree', () => {
    const groups=groupResults([page('a',[card()]),page('b',[card({title:'Other title'})])],EMPTY_SEARCH);
    expect(groups).toHaveLength(1);
    expect(groups[0].origins).toEqual(['a','b']);
    expect(groups[0].occurrences.map((o) => o.card.title)).toEqual(['Dante','Other title']);
  });
  it('never manufactures a match by combining metadata from different records', () => {
    const groups=groupResults([page('a',[card({creator:'Dante',publisher:'Wrong'})]),page('b',[card({creator:'Wrong',publisher:'Aldus'})])],{...EMPTY_SEARCH,author:'Dante',publisher:'Aldus'});
    expect(groups[0].match).toBe('excluded');
  });
  it('shows the occurrence that actually satisfies all criteria', () => {
    const groups=groupResults([page('a',[card({creator:null})]),page('b',[card({creator:'Dante'})])],{...EMPTY_SEARCH,author:'Dante'});
    expect(groups[0].match).toBe('match');
    expect(groups[0].providerKey).toBe('b');
    expect(groups[0].card.creator).toBe('Dante');
  });
});
