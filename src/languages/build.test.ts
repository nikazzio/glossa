import { describe, expect, it } from 'vitest';
import { buildIsoRows, buildLanguageListUpdate, buildVarietyRows, mergeIsoRows, mergeVarietyRows, parseCsv, type IsoFile, type VarietiesFile } from './build';

const ISO_TAB = [
  'Id\tPart2b\tPart2t\tPart1\tScope\tLanguage_Type\tRef_Name\tComment',
  'ita\tita\tita\tit\tI\tL\tItalian\t',
  'lat\tlat\tlat\tla\tI\tA\tLatin\t',
  'qaa\t\t\t\tS\tS\tReserved\t',
].join('\n');

const GLOTTOLOG_CSV = [
  'ID,Name,Macroarea,Latitude,Longitude,Glottocode,ISO639P3code,Level,Language_ID',
  'ital1282,Italian,,,,ital1282,ita,language,',
  'oldi1245,"Old Italian, early",,,,oldi1245,,dialect,ital1282',
  'orph0001,Orphan,,,,orph0001,,dialect,none0000',
].join('\n');

const italian = (code: string) => ({ it: 'italiano', la: 'latino' } as Record<string, string>)[code] ?? null;

describe('language list build', () => {
  it('keeps individual languages only, with capitalised Italian names and the historical flag', () => {
    expect(buildIsoRows(ISO_TAB, italian)).toEqual([
      ['ita', 'Italian', 'Italiano', 0],
      ['lat', 'Latin', 'Latino', 1],
    ]);
  });

  it('rejects a source without the expected columns', () => {
    expect(() => buildIsoRows('Code\tName\nita\tItalian', italian)).toThrow('Missing columns');
  });

  it('parses quoted CSV fields and links dialects to their ISO language', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n')).toEqual([['a', 'b, c', 'd "e"']]);
    expect(buildVarietyRows(GLOTTOLOG_CSV, new Set(['ita']))).toEqual({ ita: [['oldi1245', 'Old Italian, early']] });
  });

  it('keeps codes gone from the sources as retired and counts new and newly retired ones', () => {
    const merged = mergeIsoRows(
      [['ita', 'Italian', 'Italiano', 0], ['xyz', 'Old code', null, 0], ['old', 'Retired before', null, 0, 1]],
      [['ita', 'Italian', 'Italiano', 0], ['new', 'New language', null, 0]],
    );
    expect(merged.rows).toEqual([
      ['ita', 'Italian', 'Italiano', 0],
      ['new', 'New language', null, 0],
      ['old', 'Retired before', null, 0, 1],
      ['xyz', 'Old code', null, 0, 1],
    ]);
    expect(merged.added).toBe(1);
    expect(merged.retired).toBe(1);
  });

  it('keeps varieties gone from Glottolog as retired under their language', () => {
    expect(mergeVarietyRows(
      { ita: [['gone0001', 'Gone variety'], ['oldi1245', 'Old Italian']] },
      { ita: [['oldi1245', 'Old Italian']] },
    )).toEqual({ ita: [['gone0001', 'Gone variety', 1], ['oldi1245', 'Old Italian']] });
  });

  it('builds an update stamped with the retrieval date from the downloaded sources and the list in use', () => {
    const current: { iso: IsoFile; varieties: VarietiesFile } = {
      iso: { source: '', retrievedAt: '2026-10-05', languages: [['ita', 'Italian', 'Italiano', 0]] },
      varieties: { source: '', retrievedAt: '2026-10-05', varieties: {} },
    };
    const update = buildLanguageListUpdate({ isoTab: ISO_TAB, glottologCsv: GLOTTOLOG_CSV }, current, italian, '2026-10-07');
    expect(update.iso.retrievedAt).toBe('2026-10-07');
    expect(update.iso.languages.map(([code]) => code)).toEqual(['ita', 'lat']);
    expect(update.varieties.varieties.ita).toEqual([['oldi1245', 'Old Italian, early']]);
    expect(update.added).toBe(1);
    expect(update.retired).toBe(0);
  });
});
