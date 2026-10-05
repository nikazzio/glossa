import type { LanguageChoice } from '../types';

/** One ISO 639-3 language, as bundled from the SIL register. */
export interface LanguageEntry {
  code: string;
  /** Official ISO reference name (English). */
  name: string;
  /** Italian name from CLDR, when CLDR has one. */
  itName: string | null;
  historical: boolean;
}

/** One Glottolog variety (dialect level) of an ISO language. */
export interface VarietyEntry {
  code: string;
  name: string;
  languageCode: string;
}

export interface LanguageCatalog {
  languages: ReadonlyMap<string, LanguageEntry>;
  varietiesOf: (languageCode: string) => readonly VarietyEntry[];
  variety: (code: string) => VarietyEntry | undefined;
}

export interface LanguageSearchGroups {
  used: LanguageEntry[];
  historical: LanguageEntry[];
  other: LanguageEntry[];
}

type IsoRow = [code: string, name: string, itName: string | null, historical: 0 | 1];
type VarietyRow = [code: string, name: string];

/** Results per group: enough to find by typing, light enough to render in a popover. */
const MAX_RESULTS_PER_GROUP = 40;

let catalogPromise: Promise<LanguageCatalog> | null = null;

/** Loads the bundled lists once; they live in their own chunk, outside the main bundle. */
export function loadLanguageCatalog(): Promise<LanguageCatalog> {
  // Testo grezzo, non modulo JSON: il compilatore non deduce tipi da 20.000 voci.
  catalogPromise ??= Promise.all([
    import('./data/iso639-3.json?raw'),
    import('./data/glottolog-varieties.json?raw'),
  ]).then(([iso, glottolog]) => buildCatalog(
    parseIsoRows(iso.default),
    parseVarietyRows(glottolog.default),
  )).catch((error: unknown) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIsoRow = (row: unknown): row is IsoRow => Array.isArray(row)
  && typeof row[0] === 'string' && typeof row[1] === 'string'
  && (row[2] === null || typeof row[2] === 'string') && (row[3] === 0 || row[3] === 1);

const isVarietyRow = (row: unknown): row is VarietyRow => Array.isArray(row)
  && typeof row[0] === 'string' && typeof row[1] === 'string';

function parseIsoRows(text: string): IsoRow[] {
  const data: unknown = JSON.parse(text);
  const rows = isRecord(data) ? data.languages : null;
  if (!Array.isArray(rows) || !rows.every(isIsoRow)) throw new Error('Invalid ISO 639-3 language list');
  return rows;
}

function parseVarietyRows(text: string): Record<string, VarietyRow[]> {
  const data: unknown = JSON.parse(text);
  const varieties = isRecord(data) ? data.varieties : null;
  if (!isRecord(varieties)) throw new Error('Invalid Glottolog variety list');
  return Object.fromEntries(Object.entries(varieties).map(([code, rows]) => {
    if (!Array.isArray(rows) || !rows.every(isVarietyRow)) throw new Error(`Invalid Glottolog varieties for ${code}`);
    return [code, rows];
  }));
}

function buildCatalog(isoRows: IsoRow[], varietyRows: Record<string, VarietyRow[]>): LanguageCatalog {
  const languages = new Map(isoRows.map(([code, name, itName, historical]) =>
    [code, { code, name, itName, historical: historical === 1 }] as const));
  const varieties = new Map(Object.entries(varietyRows).map(([languageCode, rows]) =>
    [languageCode, rows.map(([code, name]) => ({ code, name, languageCode }))] as const));
  const byCode = new Map([...varieties.values()].flat().map((entry) => [entry.code, entry] as const));
  return {
    languages,
    varietiesOf: (languageCode) => varieties.get(languageCode) ?? [],
    variety: (code) => byCode.get(code),
  };
}

const isItalianUi = (uiLanguage: string) => uiLanguage.toLowerCase().startsWith('it');

export function languageName(entry: LanguageEntry, uiLanguage: string): string {
  return isItalianUi(uiLanguage) && entry.itName ? entry.itName : entry.name;
}

/** Name of a saved code; an unknown code (retired, or from a newer list) stays readable as itself. */
export function languageNameOf(catalog: LanguageCatalog | null, code: string, uiLanguage: string): string {
  const entry = catalog?.languages.get(code);
  return entry ? languageName(entry, uiLanguage) : code;
}

export function varietyNameOf(catalog: LanguageCatalog | null, code: string): string {
  return catalog?.variety(code)?.name ?? code;
}

/** Short label of one side: «Latino (Medieval Latin)», or null when nothing is chosen. */
export function describeLanguageChoice(catalog: LanguageCatalog | null, choice: LanguageChoice, uiLanguage: string): string | null {
  if (!choice.code) return null;
  const name = languageNameOf(catalog, choice.code, uiLanguage);
  return choice.variety ? `${name} (${varietyNameOf(catalog, choice.variety)})` : name;
}

/**
 * Plain description for a model prompt: name, variety and note, always in
 * English names so the instruction reads the same whatever the interface language.
 */
export function describeLanguageForModel(catalog: LanguageCatalog | null, choice: LanguageChoice): string {
  if (!choice.code) return 'not specified';
  const name = catalog?.languages.get(choice.code)?.name ?? choice.code;
  const variety = choice.variety ? `, ${varietyNameOf(catalog, choice.variety)}` : '';
  const note = choice.note.trim() ? ` — ${choice.note.trim()}` : '';
  return `${name}${variety}${note}`;
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function matches(entry: LanguageEntry, query: string): boolean {
  if (!query) return true;
  return entry.code === query
    || normalize(entry.name).includes(query)
    || (entry.itName !== null && normalize(entry.itName).includes(query));
}

/** Languages matching the query, grouped: already used in the workspace, historical, all the others. */
export function searchLanguages(
  catalog: LanguageCatalog,
  rawQuery: string,
  uiLanguage: string,
  usedCodes: readonly string[],
): LanguageSearchGroups {
  const query = normalize(rawQuery);
  const used = new Set(usedCodes);
  const byName = (a: LanguageEntry, b: LanguageEntry) =>
    languageName(a, uiLanguage).localeCompare(languageName(b, uiLanguage), uiLanguage);
  // L'elenco intero si mostra solo cercando: senza testo, gruppi «usate» e «storiche».
  const found = [...catalog.languages.values()].filter((entry) => matches(entry, query));
  const exactFirst = (list: LanguageEntry[]) => [
    ...list.filter((entry) => entry.code === query),
    ...list.filter((entry) => entry.code !== query).sort(byName),
  ].slice(0, MAX_RESULTS_PER_GROUP);
  return {
    used: exactFirst(found.filter((entry) => used.has(entry.code))),
    historical: exactFirst(found.filter((entry) => !used.has(entry.code) && entry.historical)),
    other: query ? exactFirst(found.filter((entry) => !used.has(entry.code) && !entry.historical)) : [],
  };
}

export function searchVarieties(catalog: LanguageCatalog, languageCode: string, rawQuery: string): VarietyEntry[] {
  const query = normalize(rawQuery);
  return catalog.varietiesOf(languageCode)
    .filter((entry) => !query || entry.code === query || normalize(entry.name).includes(query))
    .slice(0, MAX_RESULTS_PER_GROUP);
}

/** Free text from elsewhere (the book's language field) matched to a code, or null when unsure. */
export function matchLanguage(catalog: LanguageCatalog, freeText: string | null | undefined): string | null {
  const query = normalize(freeText ?? '');
  if (!query) return null;
  if (catalog.languages.has(query)) return query;
  const exact = [...catalog.languages.values()].filter((entry) =>
    normalize(entry.name) === query || (entry.itName !== null && normalize(entry.itName) === query));
  return exact.length === 1 ? exact[0]!.code : null;
}

/** ISO 639 code for «undetermined»: stored texts not given a language carry this one. */
export const UNDETERMINED_LANGUAGE = 'und';
